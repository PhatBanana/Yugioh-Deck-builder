package com.phatbanana.ygodeckbuilder;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * A real "Save as…" for exports, via the system file picker
 * (ACTION_CREATE_DOCUMENT / Storage Access Framework). The share sheet the
 * app used before reads as "send this somewhere"; this shows the standard
 * save dialog where the user picks Downloads/Drive/anywhere and gets an
 * actual file. No storage permission needed on any Android version.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

  @PluginMethod
  public void save(PluginCall call) {
    String fileName = call.getString("fileName", "export.txt");
    String mimeType = call.getString("mimeType", "application/octet-stream");
    String text = call.getString("text");
    String base64 = call.getString("base64");
    if (text == null && base64 == null) {
      call.reject("Provide 'text' or 'base64' content");
      return;
    }

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(mimeType);
    intent.putExtra(Intent.EXTRA_TITLE, fileName);

    startActivityForResult(call, intent, "saveResult");
  }

  @ActivityCallback
  private void saveResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      // User backed out of the picker — not an error.
      JSObject ret = new JSObject();
      ret.put("saved", false);
      call.resolve(ret);
      return;
    }
    Uri uri = result.getData().getData();
    try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
      String text = call.getString("text");
      byte[] bytes = text != null
        ? text.getBytes(StandardCharsets.UTF_8)
        : Base64.decode(call.getString("base64"), Base64.DEFAULT);
      out.write(bytes);
      out.flush();
      JSObject ret = new JSObject();
      ret.put("saved", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Couldn't write the file: " + e.getMessage());
    }
  }
}
