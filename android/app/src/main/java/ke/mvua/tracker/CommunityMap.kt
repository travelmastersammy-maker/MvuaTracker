package ke.mvua.tracker

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.mvua.tracker.data.MapCommunityReport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private data class MapCoordinate(val longitude: Double, val latitude: Double)
private data class CountyShape(val name: String, val polygons: List<List<List<MapCoordinate>>>)
private data class MapViewBox(val x: Float, val y: Float, val width: Float, val height: Float)
private data class DotGroup(val longitude: Double, val latitude: Double, val reports: List<MapCommunityReport>, val severity: String)

private val KenyaMapView = MapViewBox(0f, 0f, 500f, 600f)
private val DryYellow = Color(0xFFE5BF62)
private val MapLightGreen = Color(0xFF8D9F52)
private val MapMediumGreen = Color(0xFF6D8738)
private val MapHeavyGreen = Color(0xFF506D2B)
private val MapStormGreen = Color(0xFF344D23)

@Composable
fun CommunityMapSection(reports: List<MapCommunityReport>, reportsError: String) {
    val context = LocalContext.current
    var counties by remember { mutableStateOf<List<CountyShape>>(emptyList()) }
    var selectedCounty by remember { mutableStateOf("Kenya") }
    var selectedDot by remember { mutableStateOf<DotGroup?>(null) }
    var countyMenuOpen by remember { mutableStateOf(false) }
    var mapError by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        runCatching {
            withContext(Dispatchers.IO) {
                context.assets.open("kenya-counties.geojson").bufferedReader().use { readCountyShapes(it.readText()) }
            }
        }.onSuccess { counties = it }.onFailure { mapError = "County map could not be loaded." }
    }

    val selectedShape = counties.firstOrNull { countyKey(it.name) == countyKey(selectedCounty) }
    val viewBox = remember(selectedShape, counties) { selectedShape?.let(::countyViewBox) ?: KenyaMapView }
    val visibleReports = remember(reports, selectedCounty) {
        if (selectedCounty == "Kenya") reports else reports.filter { countyKey(it.county) == countyKey(selectedCounty) }
    }
    val dots = remember(visibleReports) { groupMapDots(visibleReports) }

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text("Rain reports across Kenya", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
            Text("Last 24 hours", fontSize = 9.sp, color = Muted)
        }
        Text("Recent community observations are unverified. Tap a county or choose one below.", fontSize = 11.sp, color = Muted, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        Box {
            OutlinedButton(onClick = { countyMenuOpen = true }, shape = RoundedCornerShape(12.dp)) {
                Text(if (selectedCounty == "Kenya") "All Kenya" else "$selectedCounty County", color = Ink, fontSize = 12.sp)
            }
            DropdownMenu(expanded = countyMenuOpen, onDismissRequest = { countyMenuOpen = false }) {
                DropdownMenuItem(text = { Text("All Kenya") }, onClick = { selectedCounty = "Kenya"; selectedDot = null; countyMenuOpen = false })
                counties.sortedBy { it.name }.forEach { shape ->
                    DropdownMenuItem(text = { Text("${shape.name} County") }, onClick = { selectedCounty = shape.name; selectedDot = null; countyMenuOpen = false })
                }
            }
        }
        Spacer(Modifier.height(7.dp))
        if (mapError.isNotBlank()) InfoCard(mapError, isWarning = true) { }
        else if (counties.isEmpty()) Text("Loading Kenya county boundaries…", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(12.dp))
        else Canvas(
            Modifier.fillMaxWidth().height(310.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFFEDF0DC))
                .semantics { contentDescription = "Tappable map of Kenya counties and recent user rain reports" }
                .pointerInput(counties, dots, viewBox) {
                    detectTapGestures { tap ->
                        val px = viewBox.x + tap.x / size.width * viewBox.width
                        val py = viewBox.y + tap.y / size.height * viewBox.height
                        val nearbyDot = dots.map { dot ->
                            val point = mapProject(dot.longitude, dot.latitude)
                            dot to hypot((point.first - px) * size.width / viewBox.width, (point.second - py) * size.height / viewBox.height)
                        }.minByOrNull { it.second }
                        if (nearbyDot != null && nearbyDot.second < 22f) selectedDot = nearbyDot.first
                        else {
                            val longitude = 33.5 + px / 500.0 * (42.35 - 33.5)
                            val latitude = 5.65 - py / 600.0 * (5.65 + 4.95)
                            counties.firstOrNull { contains(it, longitude, latitude) }?.let { hit ->
                                selectedCounty = hit.name
                                selectedDot = null
                            }
                        }
                    }
                }
        ) {
            fun screenPoint(point: MapCoordinate): Offset {
                val projected = mapProject(point.longitude, point.latitude)
                return Offset((projected.first - viewBox.x) / viewBox.width * size.width, (projected.second - viewBox.y) / viewBox.height * size.height)
            }
            counties.forEach { shape ->
                shape.polygons.forEach { polygon ->
                    val path = Path()
                    polygon.forEach { ring ->
                        ring.forEachIndexed { index, coordinate ->
                            val point = screenPoint(coordinate)
                            if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
                        }
                        path.close()
                    }
                    val fill = if (selectedCounty != "Kenya" && countyKey(shape.name) == countyKey(selectedCounty)) Color(0xFFB7CA84) else Color(0xFFDCE4C2)
                    drawPath(path, fill)
                    drawPath(path, Color(0xFF748153), style = Stroke(width = 0.8.dp.toPx()))
                }
            }
            dots.forEach { dot ->
                val projected = screenPoint(MapCoordinate(dot.longitude, dot.latitude))
                val radius = when (dot.severity) {
                    "No rain", "Drizzle" -> 5.dp.toPx()
                    "Slight shower" -> 6.dp.toPx()
                    "Medium rain" -> 7.5.dp.toPx()
                    "Heavy rain" -> 9.dp.toPx()
                    else -> 11.dp.toPx()
                } + min(3, dot.reports.size - 1).coerceAtLeast(0) * 1.2.dp.toPx()
                val color = if (dot.severity == "No rain") DryYellow else severityColor(dot.severity)
                drawCircle(color, radius = radius, center = projected)
                drawCircle(if (dot.severity == "No rain") Color(0xFF8A7133) else Color(0xFFFFFDF0), radius = radius, center = projected, style = Stroke(width = 1.2.dp.toPx()))
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MapLegendDot("Light", MapLightGreen, 5.dp)
            MapLegendDot("Medium", MapMediumGreen, 7.dp)
            MapLegendDot("Heavy / storm", MapStormGreen, 10.dp)
            MapLegendDot("No rain", DryYellow, 6.dp)
        }
        val count = visibleReports.size
        Text(if (reportsError.isNotBlank()) reportsError else if (count == 0) "No recent reports${if (selectedCounty == "Kenya") " across Kenya" else " in $selectedCounty County"} yet." else "$count recent unverified report${if (count == 1) "" else "s"}${if (selectedCounty == "Kenya") " across Kenya" else " in $selectedCounty County"}.", fontSize = 10.sp, color = if (reportsError.isNotBlank()) AlertRed else Muted, modifier = Modifier.padding(top = 6.dp))
        selectedDot?.let { dot ->
            Column(Modifier.fillMaxWidth().padding(top = 5.dp).background(SurfaceCream, RoundedCornerShape(10.dp)).padding(9.dp)) {
                Text("${dot.severity} · ${dot.reports.size} unverified report${if (dot.reports.size == 1) "" else "s"}", color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                dot.reports.take(6).forEach { report -> Text("${report.place}${if (report.county.isBlank()) "" else ", ${report.county}"} · ${report.date} · ${report.startTime}–${report.endTime} EAT", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp)) }
            }
        }
        Text("Map dots are approximate: coordinates are rounded to about 1 km. County boundaries: geoBoundaries Kenya ADM1 (public domain; RCMRD GeoPortal / Africa GeoPortal).", color = Muted, fontSize = 8.sp, modifier = Modifier.padding(top = 7.dp))
    }
}

@Composable
private fun MapLegendDot(label: String, color: Color, size: androidx.compose.ui.unit.Dp) {
    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Box(Modifier.size(size).background(color, RoundedCornerShape(50)))
        Text(label, fontSize = 8.sp, color = Muted, modifier = Modifier.padding(start = 4.dp))
    }
}

private fun readCountyShapes(content: String): List<CountyShape> {
    val features = JSONObject(content).optJSONArray("features") ?: JSONArray()
    return (0 until features.length()).mapNotNull { index ->
        val feature = features.optJSONObject(index) ?: return@mapNotNull null
        val name = feature.optJSONObject("properties")?.optString("shapeName").orEmpty()
        val geometry = feature.optJSONObject("geometry") ?: return@mapNotNull null
        val coordinates = geometry.optJSONArray("coordinates") ?: return@mapNotNull null
        val polygons = when (geometry.optString("type")) {
            "Polygon" -> listOf(parsePolygon(coordinates))
            "MultiPolygon" -> (0 until coordinates.length()).mapNotNull { coordinates.optJSONArray(it)?.let(::parsePolygon) }
            else -> emptyList()
        }
        if (name.isBlank() || polygons.isEmpty()) null else CountyShape(displayCountyName(name), polygons)
    }
}

private fun parsePolygon(rings: JSONArray): List<List<MapCoordinate>> = (0 until rings.length()).mapNotNull { ringIndex ->
    val ring = rings.optJSONArray(ringIndex) ?: return@mapNotNull null
    (0 until ring.length()).mapNotNull { pointIndex ->
        val point = ring.optJSONArray(pointIndex) ?: return@mapNotNull null
        MapCoordinate(point.optDouble(0), point.optDouble(1))
    }.takeIf { it.size >= 3 }
}

private fun countyViewBox(shape: CountyShape): MapViewBox {
    val points = shape.polygons.flatten().flatten().map { mapProject(it.longitude, it.latitude) }
    if (points.isEmpty()) return KenyaMapView
    val left = points.minOf { it.first }; val right = points.maxOf { it.first }
    val top = points.minOf { it.second }; val bottom = points.maxOf { it.second }
    val x = max(0.0, left - 9.0); val y = max(0.0, top - 9.0)
    val width = min(500.0 - x, max(34.0, right - left + 18.0)); val height = min(600.0 - y, max(34.0, bottom - top + 18.0))
    return MapViewBox(x.toFloat(), y.toFloat(), width.toFloat(), height.toFloat())
}

private fun mapProject(longitude: Double, latitude: Double): Pair<Double, Double> =
    ((longitude - 33.5) / (42.35 - 33.5) * 500.0) to ((5.65 - latitude) / (5.65 + 4.95) * 600.0)

private fun countyKey(value: String): String {
    val key = value.trim().lowercase().replace(Regex("\\s+county$"), "").replace('-', ' ').replace(Regex("\\s+"), " ")
    return when (key) { "nairobi city" -> "nairobi"; "tharaka nithi" -> "tharaka"; else -> key }
}

private fun displayCountyName(name: String): String = when (name) {
    "Nairobi" -> "Nairobi City"
    "Tharaka" -> "Tharaka Nithi"
    "Elgeyo-Marakwet" -> "Elgeyo Marakwet"
    else -> name
}

private fun contains(shape: CountyShape, longitude: Double, latitude: Double): Boolean = shape.polygons.any { rings ->
    rings.isNotEmpty() && insideRing(rings.first(), longitude, latitude) && rings.drop(1).none { insideRing(it, longitude, latitude) }
}

private fun insideRing(ring: List<MapCoordinate>, longitude: Double, latitude: Double): Boolean {
    var inside = false
    var previous = ring.lastOrNull() ?: return false
    for (current in ring) {
        val crosses = (current.latitude > latitude) != (previous.latitude > latitude) &&
            longitude < (previous.longitude - current.longitude) * (latitude - current.latitude) / ((previous.latitude - current.latitude).let { if (abs(it) < 1e-12) 1e-12 else it }) + current.longitude
        if (crosses) inside = !inside
        previous = current
    }
    return inside
}

private fun groupMapDots(reports: List<MapCommunityReport>): List<DotGroup> = reports
    .groupBy { "${(it.latitude * 100).roundToInt()}|${(it.longitude * 100).roundToInt()}" }
    .values.mapNotNull { group ->
        val rainReports = group.filterNot { it.severity == "No rain" }
        val noRainReports = group.filter { it.severity == "No rain" }
        val chosen = (rainReports.ifEmpty { noRainReports }).maxByOrNull { severityRank(it.severity) } ?: return@mapNotNull null
        DotGroup(chosen.longitude, chosen.latitude, group, chosen.severity)
    }

private fun severityRank(value: String): Int = when (value) {
    "Drizzle" -> 1; "Slight shower" -> 2; "Medium rain" -> 3; "Heavy rain" -> 4; "Storm / thunderstorm" -> 5; else -> 0
}

private fun severityColor(value: String): Color = when (value) {
    "Drizzle", "Slight shower" -> MapLightGreen
    "Medium rain" -> MapMediumGreen
    "Heavy rain" -> MapHeavyGreen
    else -> MapStormGreen
}
