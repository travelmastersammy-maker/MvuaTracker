package ke.mvua.tracker

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.mvua.tracker.data.CommunityReport
import ke.mvua.tracker.data.OfficialAlert

@Composable
fun AlertsSection(available: Boolean, alerts: List<OfficialAlert>, updatedAt: String) {
    val context = LocalContext.current
    Column {
        SectionTitle("Kenya Met alerts", "Official feed · location matched")
        Spacer(Modifier.height(8.dp))
        if (!available) {
            InfoCard("Kenya Met alerts are temporarily unavailable. Check the official warnings page directly.", true) {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://meteo.go.ke/weather-warnings/")))
            }
        } else if (alerts.isEmpty()) InfoCard("No active official alerts matched this location.", false) { }
        else alerts.forEach { alert -> AlertCard(alert) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(alert.link.ifBlank { "https://meteo.go.ke/weather-warnings/" })))
        } }
        if (updatedAt.isNotBlank()) Text("Feed refreshed ${timeOnly(updatedAt)} EAT", fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun AlertCard(alert: OfficialAlert, onOpen: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp).clickable(onClick = onOpen), colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFFF5E5)), shape = RoundedCornerShape(17.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text("OFFICIAL · ${alert.severity.ifBlank { "ADVISORY" }.uppercase()}", color = AlertRed, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .8.sp)
            Text(alert.title.ifBlank { alert.event }, color = Ink, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp))
            Text(alert.description.ifBlank { alert.area }, color = Muted, fontSize = 12.sp, maxLines = 5, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 5.dp))
            Text("Issued ${dayLabel(alert.published.take(10))} · Tap for KMD details", color = AlertRed, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
fun CommunitySection(reports: List<CommunityReport>, onReport: () -> Unit) {
    Column {
        Text("Live updates from users", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Nearby · last 24 hours", fontSize = 11.sp, color = Muted)
        Text("Shared by users and unverified. These are not Kenya Met alerts.", fontSize = 11.sp, color = Muted, modifier = Modifier.padding(top = 5.dp, bottom = 9.dp))
        if (reports.isEmpty()) InfoCard("No recent reports nearby. Share what you are seeing.", false) { }
        reports.forEach { CommunityReportCard(it) }
        Button(onClick = onReport, modifier = Modifier.fillMaxWidth().padding(top = 6.dp), colors = ButtonDefaults.buttonColors(containerColor = Olive), shape = RoundedCornerShape(15.dp)) {
            Text("＋  Is it raining where you are?", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 4.dp))
        }
    }
}

@Composable
private fun CommunityReportCard(report: CommunityReport) {
    Card(Modifier.fillMaxWidth().padding(bottom = 7.dp), colors = CardDefaults.cardColors(containerColor = SurfaceCream), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(13.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(report.severity, modifier = Modifier.weight(1f), color = Ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("UNVERIFIED", color = Olive, fontSize = 8.sp, fontWeight = FontWeight.ExtraBold)
            }
            Text("${report.place}${if (report.county.isNotBlank()) ", ${report.county}" else ""} · ${dayLabel(report.date)} · ${report.startTime}–${report.endTime} EAT", fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 4.dp))
            if (report.comment.isNotBlank()) Text(report.comment, color = Ink, fontSize = 12.sp, modifier = Modifier.padding(top = 7.dp))
            if (report.commentStatus == "pending") Text("Comment withheld pending safety review", color = AlertRed, fontSize = 10.sp, modifier = Modifier.padding(top = 5.dp))
        }
    }
}

@Composable
fun SectionTitle(title: String, subtitle: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text(subtitle, fontSize = 9.sp, color = Muted)
    }
}

@Composable
fun InfoCard(message: String, isWarning: Boolean, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = if (isWarning) androidx.compose.ui.graphics.Color(0xFFFFF3E6) else SurfaceCream), shape = RoundedCornerShape(15.dp)) {
        Text(message, color = if (isWarning) AlertRed else Muted, fontSize = 12.sp, modifier = Modifier.padding(14.dp))
    }
}

@Composable
fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp), colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFFF1E9)), shape = RoundedCornerShape(15.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 13.dp, end = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, Modifier.weight(1f), color = AlertRed, fontSize = 11.sp)
            TextButton(onClick = onRetry) { Text("Retry", color = AlertRed) }
        }
    }
}

@Composable
fun LoadingPanel(loading: Boolean) {
    Card(Modifier.fillMaxWidth().height(160.dp), colors = CardDefaults.cardColors(containerColor = SurfaceCream), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            if (loading) CircularProgressIndicator(color = Olive, strokeWidth = 3.dp)
            Text(if (loading) "Loading rain forecast…" else "Forecast not loaded yet.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
fun PrivacyDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val policyUrl = BuildConfig.MVUA_PRIVACY_POLICY_URL
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Privacy & community reports", color = Ink, fontWeight = FontWeight.Bold) },
        text = { Text("MvuaTracker does not request device location or create user accounts. You choose the town for forecasts and reports. A report includes the selected place and coordinates, observation date/time, rainfall severity, optional comment, and report time. Reports are unverified. Comments are checked by the service before display; comment text may be sent to the moderation provider. Please do not include personal details. The production privacy notice and deletion process must be completed before public release.", color = Muted, fontSize = 13.sp) },
        confirmButton = { Row { if (policyUrl.startsWith("https://")) TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(policyUrl))) }) { Text("Full privacy policy", color = Olive) }; TextButton(onClick = onDismiss) { Text("Close", color = Olive) } } },
        containerColor = SurfaceCream
    )
}
