package com.phatbanana.ygodeckbuilder;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Local plugins must register before the bridge initializes.
    registerPlugin(SaveFilePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
