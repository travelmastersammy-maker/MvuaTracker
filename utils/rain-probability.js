const MAX_CALIBRATED_PROBABILITY = 95;

function intensityFactor(millimetres) {
  const amount = Number(millimetres);
  if (!Number.isFinite(amount)) return 0.1;
  if (amount <= 0.1) return 0;
  if (amount <= 0.5) return 0.1;
  if (amount <= 1) return 0.2;
  if (amount <= 2) return 0.3;
  if (amount <= 5) return 0.5;
  if (amount <= 10) return 0.75;
  return 1;
}

/**
 * Adjusts model occurrence probability using forecast rainfall amount.
 * This is a transparent product heuristic, not a statistically validated forecast.
 */
function calibrateRainProbability(rawProbability, millimetres, officialThunderstormWarning = false) {
  if (rawProbability == null || rawProbability === '') return null;
  const probability = Number(rawProbability);
  const amount = Number(millimetres);
  if (!Number.isFinite(probability)) return null;

  const boundedProbability = Math.max(0, Math.min(100, probability));
  if (boundedProbability === 0) return 0;
  if (millimetres == null || millimetres === '' || !Number.isFinite(amount)) {
    return Math.min(MAX_CALIBRATED_PROBABILITY, Math.round(boundedProbability));
  }
  if (officialThunderstormWarning && Number.isFinite(amount) && amount > 0) return 100;

  const adjusted = Math.round(boundedProbability * intensityFactor(amount));
  return Math.max(0, Math.min(MAX_CALIBRATED_PROBABILITY, adjusted));
}

function isOfficialThunderstormWarning(alert) {
  const text = `${alert?.title || ''} ${alert?.event || ''} ${alert?.description || ''}`;
  return /\b(thunderstorms?|thunder storms?|lightning)\b/i.test(text)
    && /\b(warning|alert|advisory)\b/i.test(text);
}

function calibrateForecastProbabilities(forecast, officialThunderstormWarning = false) {
  const hourly = forecast?.hourly;
  const daily = forecast?.daily;
  if (!hourly && !daily) return forecast;

  if (hourly) {
    const raw = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    const amounts = Array.isArray(hourly.precipitation) ? hourly.precipitation : [];
    hourly.precipitation_probability_raw = [...raw];
    hourly.precipitation_probability = raw.map((probability, index) =>
      calibrateRainProbability(probability, amounts[index], officialThunderstormWarning));
  }

  if (daily) {
    const raw = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
    const totals = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum : [];
    const dates = Array.isArray(daily.time) ? daily.time : [];
    const hourlyDates = Array.isArray(hourly?.time) ? hourly.time : [];
    const hourlyAmounts = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];
    daily.precipitation_probability_max_raw = [...raw];
    daily.precipitation_probability_max = raw.map((probability, index) => {
      const date = String(dates[index] || '');
      const peakHourlyAmount = hourlyDates.reduce((peak, time, hourIndex) =>
        String(time).startsWith(date) ? Math.max(peak, Number(hourlyAmounts[hourIndex]) || 0) : peak, 0);
      const dailyTotal = Number(totals[index]) || 0;
      const intensityAmount = Math.max(peakHourlyAmount, dailyTotal / 24);
      return calibrateRainProbability(probability, intensityAmount, officialThunderstormWarning);
    });
  }

  return forecast;
}

module.exports = {
  MAX_CALIBRATED_PROBABILITY,
  calibrateRainProbability,
  calibrateForecastProbabilities,
  isOfficialThunderstormWarning
};
