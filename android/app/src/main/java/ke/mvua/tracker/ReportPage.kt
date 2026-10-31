package ke.mvua.tracker

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import ke.mvua.tracker.data.MvuaRepository
import ke.mvua.tracker.data.Place
import ke.mvua.tracker.data.COMMUNITY_TERMS_VERSION
import kotlinx.coroutines.launch
import java.util.UUID
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val KenyaZone = ZoneId.of("Africa/Nairobi")

@Composable
fun ReportPage(repository: MvuaRepository, initialPlace: Place, onCancel: () -> Unit, onSubmitted: (Place, String) -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("mvua-community", android.content.Context.MODE_PRIVATE) }
    val reporterKey = remember { preferences.getString("reporter_key", null) ?: UUID.randomUUID().toString().also { preferences.edit().putString("reporter_key", it).apply() } }
    var selectedPlace by remember(initialPlace) { mutableStateOf(initialPlace) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var date by remember { mutableStateOf(LocalDate.now(KenyaZone).toString()) }
    var start by remember { mutableStateOf(defaultStartTime()) }
    var end by remember { mutableStateOf(defaultEndTime()) }
    var severity by remember { mutableStateOf(RainSeverities[0]) }
    var comment by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf("") }
    var termsAccepted by remember { mutableStateOf(preferences.getString("terms_version", null) == COMMUNITY_TERMS_VERSION) }
    var showTerms by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 26.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onCancel) { Text("← Back", color = Olive) }
            Text("Share a rain update", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        }
        Text("Tell neighbours what you observed in your area.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 12.dp))
        Text("LOCATION IN KENYA", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted)
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(query, { query = it; results = emptyList() }, Modifier.weight(1f), singleLine = true, placeholder = { Text("Town or county") }, shape = RoundedCornerShape(14.dp))
            Spacer(Modifier.width(7.dp))
            Button(onClick = {
                if (query.trim().length >= 2) scope.launch {
                    searching = true
                    try { results = repository.search(query.trim()); if (results.isEmpty()) feedback = "No Kenyan locations found." }
                    catch (e: Exception) { feedback = e.message ?: "Location search failed." }
                    finally { searching = false }
                }
            }, enabled = !searching, contentPadding = PaddingValues(horizontal = 11.dp, vertical = 13.dp), shape = RoundedCornerShape(13.dp)) {
                Text(if (searching) "…" else "Find")
            }
        }
        results.take(6).forEach { candidate ->
            Text("${candidate.name}${if (candidate.county.isNotBlank()) ", ${candidate.county}" else ""} · Kenya",
                Modifier.fillMaxWidth().clickable { selectedPlace = candidate; results = emptyList(); feedback = "" }.padding(11.dp), color = Olive, fontWeight = FontWeight.SemiBold)
        }
        Text("Selected: ${selectedPlace.name}${if (selectedPlace.county.isNotBlank()) ", ${selectedPlace.county}" else ""}", fontSize = 11.sp, color = Olive, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 5.dp))
        Text("OBSERVED DATE", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 9.dp))
        OutlinedButton(onClick = {
            val current = runCatching { LocalDate.parse(date) }.getOrElse { LocalDate.now(KenyaZone) }
            val picker = DatePickerDialog(context, { _, year, month, day -> date = LocalDate.of(year, month + 1, day).toString() }, current.year, current.monthValue - 1, current.dayOfMonth)
            picker.datePicker.minDate = LocalDate.now(KenyaZone).minusDays(7).atStartOfDay(KenyaZone).toInstant().toEpochMilli()
            picker.datePicker.maxDate = LocalDate.now(KenyaZone).atStartOfDay(KenyaZone).toInstant().toEpochMilli()
            picker.show()
        }, shape = RoundedCornerShape(13.dp)) { Text("▦  ${dayLabel(date)}", color = Ink) }
        Text("TIME RANGE · EAST AFRICA TIME", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 9.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            TimeButton("From", start) {
                val time = parseTime(start)
                TimePickerDialog(context, { _, hour, minute -> start = String.format(Locale.ROOT, "%02d:%02d", hour, minute) }, time.first, time.second, true).show()
            }
            TimeButton("To", end) {
                val time = parseTime(end)
                TimePickerDialog(context, { _, hour, minute -> end = String.format(Locale.ROOT, "%02d:%02d", hour, minute) }, time.first, time.second, true).show()
            }
        }
        Text("RAIN SEVERITY", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 9.dp))
        Box {
            OutlinedButton(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(13.dp)) { Text("${severityEmoji(severity)}  $severity", color = Ink) }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                RainSeverities.forEach { option -> DropdownMenuItem(text = { Text("${severityEmoji(option)}  $option") }, onClick = { severity = option; menuOpen = false }) }
            }
        }
        Text("COMMENT · OPTIONAL · 280 CHARACTERS MAX", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 9.dp))
        OutlinedTextField(
            value = comment, onValueChange = { if (it.length <= 280) comment = it }, modifier = Modifier.fillMaxWidth().height(115.dp),
            placeholder = { Text("What are you seeing? Please do not include names or contact details.") }, shape = RoundedCornerShape(14.dp)
        )
        Text("${comment.length} / 280", Modifier.align(Alignment.End), color = Muted, fontSize = 10.sp)
        Text("Rain observations are unverified. Comments are screened automatically and may be withheld. Recent reports can appear on the Kenya-wide map at an approximate location (coordinates rounded to about 1 km). Reports are visible for up to 24 hours and kept for up to 30 days for moderation. Do not include personal information.", color = Muted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = termsAccepted, onCheckedChange = { termsAccepted = it })
            Text("I agree to the", fontSize = 11.sp, color = Ink)
            TextButton(onClick = { showTerms = true }) { Text("Community Guidelines & Terms", color = Olive, fontSize = 11.sp) }
        }
        if (feedback.isNotBlank()) Text(feedback, color = AlertRed, fontSize = 12.sp, modifier = Modifier.padding(bottom = 7.dp))
        Button(onClick = {
            scope.launch {
                submitting = true; feedback = "Sending report…"
                try {
                    if (!termsAccepted) { feedback = "Read and accept the Community Guidelines & Terms to continue."; return@launch }
                    preferences.edit().putString("terms_version", COMMUNITY_TERMS_VERSION).apply()
                    val result = repository.submitReport(selectedPlace, date, start, end, severity, comment, reporterKey, COMMUNITY_TERMS_VERSION)
                    onSubmitted(selectedPlace, result.commentStatus)
                } catch (e: Exception) { feedback = e.message ?: "Could not submit the rain update." }
                finally { submitting = false }
            }
        }, enabled = !submitting && termsAccepted, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(15.dp), colors = ButtonDefaults.buttonColors(containerColor = Olive)) {
            if (submitting) CircularProgressIndicator(Modifier.size(18.dp), color = androidx.compose.ui.graphics.Color.White, strokeWidth = 2.dp)
            else Text("Share rain update", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 4.dp))
        }
    }
    if (showTerms) AlertDialog(
        onDismissRequest = { showTerms = false },
        title = { Text("Community Guidelines & Terms") },
        text = { Text("Share only genuine, recent rainfall observations. Do not post personal information, threats, harassment, vulgar or derogatory content, spam, or dangerous false claims. Comments may be screened, held, or removed. Rain reports are unverified and are not emergency advice. Recent reports may be shown to all app users on the Kenya-wide map with coordinates rounded to about 1 km; the map shows place, observation time and severity, not comments. Reports are visible for up to 24 hours and retained for up to 30 days for moderation. You can report a post or contributor and block a contributor. Multiple independent flags may hide content or updates from a contributor.") },
        confirmButton = { TextButton(onClick = { showTerms = false }) { Text("Close") } }
    )
}

@Composable
private fun RowScope.TimeButton(label: String, time: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.weight(1f), shape = RoundedCornerShape(13.dp)) {
        Text("$label  $time", color = Ink, fontSize = 12.sp)
    }
}

private fun parseTime(value: String): Pair<Int, Int> = runCatching {
    val parts = value.split(":"); parts[0].toInt() to parts[1].toInt()
}.getOrDefault(9 to 0)

private fun defaultEndTime(): String = LocalTime.now(KenyaZone).format(DateTimeFormatter.ofPattern("HH:mm"))
private fun defaultStartTime(): String {
    val now = LocalTime.now(KenyaZone)
    return (if (now.hour == 0) LocalTime.MIDNIGHT else now.minusHours(1)).format(DateTimeFormatter.ofPattern("HH:mm"))
}
private fun severityEmoji(value: String): String = when (value) {
    "No rain" -> "☀️"
    "Drizzle" -> "🌦️"
    "Slight shower", "Medium rain", "Heavy rain" -> "🌧️"
    else -> "⛈️"
}
