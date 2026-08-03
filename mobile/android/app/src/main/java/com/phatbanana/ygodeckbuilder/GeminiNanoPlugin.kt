package com.phatbanana.ygodeckbuilder

import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.genai.prompt.generationConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Bridges the app to on-device Gemini Nano through ML Kit's GenAI Prompt API
// (multimodal). Experimental — a harness to test whether Nano can say anything
// useful about a card's rarity from a photo.
@CapacitorPlugin(name = "GeminiNano")
class GeminiNanoPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var model: GenerativeModel? = null

    private fun model(): GenerativeModel {
        var m = model
        if (m == null) {
            m = Generation.getClient(generationConfig {})
            model = m
        }
        return m
    }

    private fun statusName(status: Int): String =
        when (status) {
            FeatureStatus.AVAILABLE -> "available"
            FeatureStatus.DOWNLOADABLE -> "downloadable"
            FeatureStatus.DOWNLOADING -> "downloading"
            else -> "unavailable"
        }

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        scope.launch {
            val res = JSObject()
            try {
                res.put("status", statusName(model().checkStatus()))
            } catch (e: Exception) {
                res.put("status", "unavailable")
                res.put("error", e.message)
            }
            call.resolve(res)
        }
    }

    // Kicks off the (large) model download and resolves when it finishes.
    @PluginMethod
    fun download(call: PluginCall) {
        scope.launch {
            try {
                model().download().collect { }
                val res = JSObject()
                res.put("done", true)
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("download failed: ${e.message}")
            }
        }
    }

    // Sends a base64 image + text prompt to Gemini Nano and returns its answer.
    @PluginMethod
    fun askAboutImage(call: PluginCall) {
        val imageB64 = call.getString("image")
        val prompt = call.getString("prompt") ?: "Describe this image."
        if (imageB64 == null) {
            call.reject("image is required")
            return
        }
        scope.launch {
            try {
                val status = model().checkStatus()
                if (status != FeatureStatus.AVAILABLE) {
                    val res = JSObject()
                    res.put("status", statusName(status))
                    call.resolve(res)
                    return@launch
                }
                val bytes = Base64.decode(imageB64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap == null) {
                    call.reject("could not decode image")
                    return@launch
                }
                val started = System.currentTimeMillis()
                val request = generateContentRequest(ImagePart(bitmap), TextPart(prompt)) {}
                val response = model().generateContent(request)
                val text = response.candidates.firstOrNull()?.text ?: ""
                val res = JSObject()
                res.put("status", "available")
                res.put("text", text)
                res.put("ms", System.currentTimeMillis() - started)
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("inference failed: ${e.message}")
            }
        }
    }
}
