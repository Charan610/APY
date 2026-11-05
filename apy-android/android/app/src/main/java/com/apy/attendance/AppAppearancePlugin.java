package com.apy.attendance;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Colours the native space outside the inset WebView, including Android 15 system bars. */
@CapacitorPlugin(name = "AppAppearance")
public class AppAppearancePlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "silver");
        final String hex;
        switch (theme) {
            case "original": hex = "#F6F7F2"; break;
            case "pink": hex = "#057eaa"; break;
            case "silver": hex = "#111216"; break;
            case "tide": hex = "#14213d"; break;
            default: call.reject("Unknown theme"); return;
        }
        final boolean lightBackground = "original".equals(theme);
        getActivity().runOnUiThread(() -> {
            int color = Color.parseColor(hex);
            Window window = getActivity().getWindow();
            window.setBackgroundDrawable(new ColorDrawable(color));
            View content = getActivity().findViewById(android.R.id.content);
            if (content != null) content.setBackgroundColor(color);
            // Legacy devices use these colours; edge-to-edge devices reveal the window background.
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(lightBackground);
            controller.setAppearanceLightNavigationBars(lightBackground);
            call.resolve();
        });
    }
}
