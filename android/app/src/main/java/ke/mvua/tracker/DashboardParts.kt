package ke.mvua.tracker

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.mvua.tracker.data.Place

@Composable
fun BrandHeader(onPrivacy: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(Olive), contentAlignment = Alignment.Center) {
                Text("M", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text("MvuaTracker", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, color = Ink, letterSpacing = (-0.6).sp)
                Text("KENYA · RAIN FIRST", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Muted, letterSpacing = 1.1.sp)
            }
        }
        TextButton(onClick = onPrivacy) { Text("Privacy", color = Olive, fontSize = 12.sp) }
    }
}

@Composable
fun SearchPanel(query: String, onQuery: (String) -> Unit, searching: Boolean, results: List<Place>, onSearch: () -> Unit, onSelect: (Place) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = query, onValueChange = onQuery, modifier = Modifier.weight(1f), singleLine = true,
            shape = RoundedCornerShape(15.dp), placeholder = { Text("Search a town or county") },
            leadingIcon = { Text("⌕", fontSize = 24.sp, color = Olive) }
        )
        Spacer(Modifier.width(8.dp))
        Button(onClick = onSearch, enabled = !searching, shape = RoundedCornerShape(13.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)) {
            if (searching) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp) else Text("Search")
        }
    }
    if (results.isNotEmpty()) {
        Card(Modifier.fillMaxWidth().padding(top = 5.dp), colors = CardDefaults.cardColors(containerColor = SurfaceCream)) {
            Column {
                results.take(6).forEach { item ->
                    Column(Modifier.fillMaxWidth().clickable { onSelect(item) }.padding(horizontal = 14.dp, vertical = 10.dp)) {
                        Text(item.name, fontWeight = FontWeight.Bold, color = Ink)
                        Text(listOf(item.county, "Kenya").filter(String::isNotBlank).joinToString(" · "), fontSize = 11.sp, color = Muted)
                    }
                }
            }
        }
    }
}

@Composable
fun RainHero(snapshot: ke.mvua.tracker.data.WeatherSnapshot, refreshing: Boolean) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.verticalGradient(listOf(DeepOlive, Olive, Color(0xFF718144)))).padding(18.dp)) {
        Column(Modifier.align(Alignment.TopStart)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("TODAY'S RAINFALL", fontSize = 10.sp, color = Color(0xFFE3E7CE), fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                if (refreshing) { Spacer(Modifier.width(8.dp)); CircularProgressIndicator(Modifier.size(12.dp), color = Amber, strokeWidth = 2.dp) }
            }
            Text(snapshot.todayMillimetres?.let { "${formatMm(it)} mm" } ?: "— mm", fontSize = 42.sp, color = Color.White, fontWeight = FontWeight.Black)
            Text("${snapshot.todayProbabilityPercent ?: 0}% chance of rain today", color = Color(0xFFF2F0DF), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text("Forecast refreshed ${timeOnly(snapshot.forecastUpdatedAt)} EAT", fontSize = 10.sp, color = Color(0xFFD6DCC1), modifier = Modifier.padding(top = 5.dp))
        }
        SavannahSkyline(Modifier.align(Alignment.BottomEnd).fillMaxWidth().height(74.dp))
    }
}

@Composable
private fun SavannahSkyline(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width; val h = size.height
        drawCircle(Amber.copy(alpha = .9f), radius = 15.dp.toPx(), center = Offset(w * .86f, h * .18f))
        val hill = Path().apply { moveTo(0f, h * .77f); quadraticTo(w * .27f, h * .48f, w * .55f, h * .76f); quadraticTo(w * .78f, h * .46f, w, h * .65f); lineTo(w, h); lineTo(0f, h); close() }
        drawPath(hill, Color(0xFF8D9B59).copy(alpha = .65f))
        val ground = Path().apply { moveTo(0f, h * .88f); quadraticTo(w * .5f, h * .71f, w, h * .88f); lineTo(w, h); lineTo(0f, h); close() }
        drawPath(ground, DeepOlive.copy(alpha = .88f))
        val trunkX = w * .74f
        drawLine(Color(0xFF303A20), Offset(trunkX, h * .86f), Offset(trunkX, h * .23f), strokeWidth = 4.dp.toPx())
        drawLine(Color(0xFF303A20), Offset(trunkX, h * .43f), Offset(w * .67f, h * .33f), strokeWidth = 2.dp.toPx())
        drawLine(Color(0xFF303A20), Offset(trunkX, h * .40f), Offset(w * .81f, h * .30f), strokeWidth = 2.dp.toPx())
        drawOval(Color(0xFF303A20), topLeft = Offset(w * .61f, h * .17f), size = androidx.compose.ui.geometry.Size(w * .27f, h * .22f))
        drawLine(Color(0xFFDED9B4).copy(alpha = .5f), Offset(w * .05f, h * .92f), Offset(w * .4f, h * .92f), strokeWidth = 1.dp.toPx())
    }
}