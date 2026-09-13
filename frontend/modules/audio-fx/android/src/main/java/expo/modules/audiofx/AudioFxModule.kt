package expo.modules.audiofx

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.PresetReverb
import android.media.audiofx.Virtualizer
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.ln
import kotlin.math.roundToInt

/**
 * Real Android DSP for LiquidAudio: attaches the platform audio effects to the player's audio
 * session and maps the app's 10-band ISO curve onto whatever bands the device equalizer exposes.
 */
class AudioFxModule : Module() {
  private val TAG = "AudioFx"
  private val isoHz = doubleArrayOf(32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)

  private var sessionId = 0
  private var equalizer: Equalizer? = null
  private var bassBoost: BassBoost? = null
  private var virtualizer: Virtualizer? = null
  private var loudness: LoudnessEnhancer? = null
  private var reverb: PresetReverb? = null

  // Desired state (kept so effects can be re-created when the session changes)
  private var enabled = true
  private var gainsDb = DoubleArray(10)
  private var bassStrength = 0          // 0..1000
  private var virtualizerStrength = 0   // 0..1000
  private var loudnessMb = 0            // millibels, 0..2000
  private var reverbPreset = 0          // PresetReverb.PRESET_NONE..PRESET_PLATE

  override fun definition() = ModuleDefinition {
    Name("AudioFx")

    Function("isAvailable") { true }

    Function("attach") { audioSessionId: Int ->
      attach(audioSessionId)
    }

    Function("setEnabled") { on: Boolean ->
      enabled = on
      applyAll()
    }

    Function("setBands") { gains: List<Double> ->
      for (i in 0 until minOf(10, gains.size)) gainsDb[i] = gains[i]
      applyEqualizer()
    }

    Function("setBassBoost") { strength: Int ->
      bassStrength = strength.coerceIn(0, 1000)
      applyBass()
    }

    Function("setVirtualizer") { strength: Int ->
      virtualizerStrength = strength.coerceIn(0, 1000)
      applyVirtualizer()
    }

    Function("setLoudness") { millibels: Int ->
      loudnessMb = millibels.coerceIn(0, 2000)
      applyLoudness()
    }

    Function("setReverb") { preset: Int ->
      reverbPreset = preset.coerceIn(0, 6)
      applyReverb()
    }

    Function("getDeviceBands") {
      val eq = equalizer
      if (eq == null) emptyList() else (0 until eq.numberOfBands.toInt()).map { eq.getCenterFreq(it.toShort()) / 1000 }
    }

    Function("release") { releaseAll() }

    OnDestroy { releaseAll() }
  }

  private fun attach(id: Int) {
    if (id == sessionId && equalizer != null) {
      applyAll()
      return
    }
    releaseAll()
    sessionId = id
    equalizer = create("Equalizer") { Equalizer(0, id) }
    bassBoost = create("BassBoost") { BassBoost(0, id) }
    virtualizer = create("Virtualizer") { Virtualizer(0, id) }
    loudness = create("LoudnessEnhancer") { LoudnessEnhancer(id) }
    reverb = create("PresetReverb") { PresetReverb(0, id) }
    applyAll()
  }

  private fun <T> create(name: String, factory: () -> T): T? = try {
    factory()
  } catch (e: Throwable) {
    Log.w(TAG, "$name unavailable on this device: ${e.message}")
    null
  }

  private fun applyAll() {
    applyEqualizer()
    applyBass()
    applyVirtualizer()
    applyLoudness()
    applyReverb()
  }

  /** Interpolate the 10-band ISO curve (dB) onto the device's bands in log-frequency space. */
  private fun applyEqualizer() {
    val eq = equalizer ?: return
    try {
      val range = eq.bandLevelRange // millibels [min, max]
      val minMb = range[0].toInt()
      val maxMb = range[1].toInt()
      for (b in 0 until eq.numberOfBands.toInt()) {
        val hz = eq.getCenterFreq(b.toShort()) / 1000.0
        val db = interpolate(hz)
        val mb = (db * 100).roundToInt().coerceIn(minMb, maxMb)
        eq.setBandLevel(b.toShort(), mb.toShort())
      }
      eq.enabled = enabled
    } catch (e: Throwable) {
      Log.w(TAG, "equalizer apply failed: ${e.message}")
    }
  }

  private fun interpolate(hz: Double): Double {
    if (hz <= isoHz.first()) return gainsDb[0]
    if (hz >= isoHz.last()) return gainsDb[9]
    val x = ln(hz)
    for (i in 0 until 9) {
      val a = ln(isoHz[i])
      val b = ln(isoHz[i + 1])
      if (x in a..b) {
        val t = (x - a) / (b - a)
        return gainsDb[i] + (gainsDb[i + 1] - gainsDb[i]) * t
      }
    }
    return 0.0
  }

  private fun applyBass() {
    val fx = bassBoost ?: return
    try {
      val on = enabled && bassStrength > 0
      if (fx.strengthSupported) fx.setStrength(bassStrength.toShort())
      fx.enabled = on
    } catch (e: Throwable) {
      Log.w(TAG, "bass apply failed: ${e.message}")
    }
  }

  private fun applyVirtualizer() {
    val fx = virtualizer ?: return
    try {
      val on = enabled && virtualizerStrength > 0
      if (fx.strengthSupported) fx.setStrength(virtualizerStrength.toShort())
      fx.enabled = on
    } catch (e: Throwable) {
      Log.w(TAG, "virtualizer apply failed: ${e.message}")
    }
  }

  private fun applyLoudness() {
    val fx = loudness ?: return
    try {
      fx.setTargetGain(loudnessMb)
      fx.enabled = enabled && loudnessMb > 0
    } catch (e: Throwable) {
      Log.w(TAG, "loudness apply failed: ${e.message}")
    }
  }

  private fun applyReverb() {
    val fx = reverb ?: return
    try {
      fx.preset = reverbPreset.toShort()
      fx.enabled = enabled && reverbPreset > 0
    } catch (e: Throwable) {
      Log.w(TAG, "reverb apply failed: ${e.message}")
    }
  }

  private fun releaseAll() {
    listOf(equalizer, bassBoost, virtualizer, loudness, reverb).forEach {
      try {
        it?.release()
      } catch (_: Throwable) {
      }
    }
    equalizer = null
    bassBoost = null
    virtualizer = null
    loudness = null
    reverb = null
  }
}
