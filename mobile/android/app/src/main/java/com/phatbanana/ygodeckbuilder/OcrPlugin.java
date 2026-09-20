package com.phatbanana.ygodeckbuilder;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * On-device OCR for card scanning, over ML Kit text recognition.
 *
 * <p>Replaces the third-party capacitor-ocr plugin, which hard-wired the Latin
 * recognizer and so could not read OCG (Japanese) cards at all. The JS contract
 * is unchanged — process({image}) resolving to {results:[{text,confidence}]} —
 * plus an optional "script".
 *
 * <p>The Japanese model bundles the same Latin model (byte-identical
 * Latn_ctc weights), so "japanese" reads mixed Latin/Japanese collections
 * without a second pass and without losing Latin accuracy. It costs ~1.2 MB
 * more in the APK, which is why the script stays a user choice rather than
 * always-on.
 */
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {

    // Recognizers are expensive to build and safe to reuse. The previous
    // plugin made a fresh one per frame and never closed it; scanning calls
    // this many times a second.
    private final Map<String, TextRecognizer> recognizers = new HashMap<>();

    private synchronized TextRecognizer recognizer(String script) {
        String key = "japanese".equals(script) ? "japanese" : "latin";
        TextRecognizer cached = recognizers.get(key);
        if (cached != null) {
            return cached;
        }
        TextRecognizer created = "japanese".equals(key)
            ? TextRecognition.getClient(new JapaneseTextRecognizerOptions.Builder().build())
            : TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizers.put(key, created);
        return created;
    }

    @PluginMethod
    public void process(PluginCall call) {
        String imageString = call.getString("image");
        if (imageString == null) {
            call.reject("missing image");
            return;
        }
        try {
            InputImage image = toInputImage(imageString);
            if (image == null) {
                call.reject("invalid image");
                return;
            }
            recognizer(call.getString("script", "latin"))
                .process(image)
                .addOnSuccessListener((visionText) -> call.resolve(toResults(visionText)))
                .addOnFailureListener((e) -> call.reject(e.getMessage(), e));
        } catch (IOException e) {
            call.reject(e.getMessage(), e);
        }
    }

    private InputImage toInputImage(String imageString) throws IOException {
        if (imageString.startsWith("data:")) {
            String payload = imageString.contains(",") ? imageString.split(",")[1] : imageString;
            byte[] decoded = Base64.decode(payload, Base64.NO_WRAP);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
            return bitmap == null ? null : InputImage.fromBitmap(bitmap, 0);
        }
        return InputImage.fromFilePath(getContext(), Uri.parse(imageString));
    }

    private JSObject toResults(Text visionText) {
        JSArray lines = new JSArray();
        for (Text.TextBlock block : visionText.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                JSObject entry = new JSObject();
                entry.put("text", line.getText());
                entry.put("confidence", line.getConfidence());
                lines.put(entry);
            }
        }
        JSObject results = new JSObject();
        results.put("results", lines);
        return results;
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            for (TextRecognizer recognizer : recognizers.values()) {
                recognizer.close();
            }
            recognizers.clear();
        }
        super.handleOnDestroy();
    }
}
