package ke.mvua.tracker.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/** Minimal client for the MvuaTracker Node API. Call from Dispatchers.IO, never the main thread. */
class MvuaRepository(private val baseUrl: String) {
    private val io = Executors.newFixedThreadPool(3)

    fun search(query: String, callback: (Result<List<Place>>) -> Unit) {
        io.execute {
            callback(runCatching {
                val root = getJson("/api/search?q=${encode(query)}")
                root.getJSONArray("locations").toPlaces()
            })
        }
    }

    fun weather(place: Place, callback: (Result<WeatherSnapshot>) -> Unit) {
        io.execute {
            callback(runCatching {
                val query = "latitude=${place.latitude}&longitude=${place.longitude}" +
                    "&place=${encode(place.name)}&county=${encode(place.county)}"
                val root = getJson("/api/weather?$query")
                WeatherSnapshot.fromJson(root)
            })
        }
    }

    private fun getJson(path: String): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
        }
        try {
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = BufferedReader(InputStreamReader(stream)).use { it.readText() }
            val json = JSONObject(text)
            if (connection.responseCode !in 200..299) error(json.optString("error", "Weather service unavailable"))
            return json
        } finally { connection.disconnect() }
    }

    private fun encode(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
}

data class Place(
    val name: String,
    val county: String,
    val latitude: Double,
    val longitude: Double,
    val timezone: String
)

private fun JSONArray.toPlaces(): List<Place> = (0 until length()).map { i ->
    val item = getJSONObject(i)
    Place(item.getString("name"), item.optString("county"), item.getDouble("latitude"),
        item.getDouble("longitude"), item.optString("timezone", "Africa/Nairobi"))
}

data class HourRain(val time: String, val probabilityPercent: Int, val millimetres: Double)
data class DayRain(val date: String, val probabilityPercent: Int, val millimetres: Double)
data class OfficialAlert(
    val title: String,
    val event: String,
    val description: String,
    val area: String,
    val severity: String,
    val published: String,
    val expires: String,
    val link: String
)
data class WeatherSnapshot(
    val place: Place,
    val todayMillimetres: Double?,
    val todayProbabilityPercent: Int?,
    val forecastUpdatedAt: String,
    val hourly: List<HourRain>,
    val sevenDays: List<DayRain>,
    val officialAlertsAvailable: Boolean,
    val officialAlertsUpdatedAt: String,
    val officialAlerts: List<OfficialAlert>
) {
    companion object {
        fun fromJson(root: JSONObject): WeatherSnapshot {
            val location = root.getJSONObject("location")
            val f = root.getJSONObject("forecast")
            val daily = f.optJSONObject("daily") ?: JSONObject()
            val hourly = f.optJSONObject("hourly") ?: JSONObject()
            val warnings = root.optJSONObject("warnings") ?: JSONObject()
            val place = Place(location.optString("name"), location.optString("county"),
                location.getDouble("latitude"), location.getDouble("longitude"), location.optString("timezone", "Africa/Nairobi"))
            val hourTimes = hourly.optJSONArray("time") ?: JSONArray()
            val rain = hourly.optJSONArray("precipitation") ?: JSONArray()
            val chance = hourly.optJSONArray("precipitation_probability") ?: JSONArray()
            val hourlyRows = (0 until hourTimes.length()).map { i ->
                HourRain(hourTimes.optString(i), chance.optInt(i), rain.optDouble(i))
            }
            val dates = daily.optJSONArray("time") ?: JSONArray()
            val totals = daily.optJSONArray("precipitation_sum") ?: JSONArray()
            val probabilities = daily.optJSONArray("precipitation_probability_max") ?: JSONArray()
            val days = (0 until dates.length()).map { i -> DayRain(dates.optString(i), probabilities.optInt(i), totals.optDouble(i)) }
            val alertsJson = warnings.optJSONArray("alerts") ?: JSONArray()
            val alerts = (0 until alertsJson.length()).map { i ->
                val a = alertsJson.getJSONObject(i)
                OfficialAlert(a.optString("title"), a.optString("event"), a.optString("description"), a.optString("area"),
                    a.optString("severity"), a.optString("published"), a.optString("expires"), a.optString("link"))
            }
            return WeatherSnapshot(place, totals.optNullableDouble(0), probabilities.optNullableInt(0),
                f.optString("fetchedAt"), hourlyRows, days, warnings.optString("status") == "ok",
                warnings.optString("fetchedAt"), alerts)
        }
    }
}

private fun JSONArray.optNullableDouble(index: Int): Double? = if (index < length() && !isNull(index)) optDouble(index) else null
private fun JSONArray.optNullableInt(index: Int): Int? = if (index < length() && !isNull(index)) optInt(index) else null
