package ke.mvua.tracker

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

fun formatMm(value: Double): String = String.format(Locale.ROOT, "%.1f", value)
fun timeOnly(value: String): String = value.substringAfter('T', value).take(5).ifBlank { "—" }
fun dayLabel(value: String): String = runCatching {
    LocalDate.parse(value.take(10)).format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.UK))
}.getOrDefault(value)