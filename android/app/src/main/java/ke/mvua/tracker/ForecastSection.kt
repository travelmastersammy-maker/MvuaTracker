package ke.mvua.tracker

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.mvua.tracker.data.DayRain
import ke.mvua.tracker.data.WeatherSnapshot
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun ForecastSection(snapshot: WeatherSnapshot) {
    var period by remember { mutableStateOf("Today") }
    var hourIndex by remember { mutableIntStateOf(0) }
    val today = LocalDate.now(ZoneId.of("Africa/Nairobi")).toString()
    val tomorrow = LocalDate.now(ZoneId.of("Africa/Nairobi")).plusDays(1).toString()
    val hours = when (period) {
        "Tomorrow" -> snapshot.hourly.filter { it.time.startsWith(tomorrow) }
        "Next 7 days" -> snapshot.hourly.take(24)
        else -> snapshot.hourly.filter { it.time.startsWith(today) }
    }
    Column {
        SectionTitle("Rain by hour", "Chance · amount")
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            listOf("Today", "Tomorrow", "Next 7 days").forEach { option ->
                FilterChip(selected = period == option, onClick = { period = option; hourIndex = 0 }, label = { Text(option) })
            }
        }
        Spacer(Modifier.height(5.dp))
        if (hours.isEmpty()) Text("Hourly rain data is unavailable for this date.", color = Muted, fontSize = 12.sp)
        else {
            val index = hourIndex.coerceIn(0, hours.lastIndex)
            val selected = hours[index]
            Card(colors = CardDefaults.cardColors(containerColor = SurfaceCream), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(15.dp)) {
                    Text("${timeOnly(selected.time)} EAT", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Muted)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("${selected.probabilityPercent}%", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Olive)
                        Spacer(Modifier.width(10.dp))
                        Text("${formatMm(selected.millimetres)} mm expected", fontSize = 13.sp, color = Ink, modifier = Modifier.padding(bottom = 4.dp))
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        hours.forEachIndexed { hour, item ->
                            val active = hour == index
                            Column(
                                Modifier.clip(RoundedCornerShape(12.dp)).background(if (active) Olive else SoftGreen)
                                    .clickable { hourIndex = hour }.padding(horizontal = 11.dp, vertical = 8.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(timeOnly(item.time), color = if (active) androidx.compose.ui.graphics.Color.White else Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                Text("${item.probabilityPercent}%", color = if (active) androidx.compose.ui.graphics.Color.White else Muted, fontSize = 10.sp)
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        SectionTitle(if (period == "Next 7 days") "7-day rain outlook" else "Daily rain outlook", "Model estimate")
        Spacer(Modifier.height(8.dp))
        val days = when (period) {
            "Tomorrow" -> snapshot.sevenDays.drop(1).take(1)
            "Next 7 days" -> snapshot.sevenDays.take(7)
            else -> snapshot.sevenDays.take(1)
        }
        days.forEach { DayRainCard(it) }
    }
}

@Composable
private fun DayRainCard(day: DayRain) {
    Card(Modifier.fillMaxWidth().padding(bottom = 7.dp), colors = CardDefaults.cardColors(containerColor = SurfaceCream), shape = RoundedCornerShape(15.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(dayLabel(day.date), modifier = Modifier.weight(1f), color = Ink, fontWeight = FontWeight.SemiBold)
            Text("${day.probabilityPercent}%", color = Olive, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(15.dp))
            Text("${formatMm(day.millimetres)} mm", color = Ink, fontWeight = FontWeight.Bold)
        }
    }
}