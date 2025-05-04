package com.clipshare;

import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.Context;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private ClipboardManager clipboardManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        startClipboardService();
    }

    private void startClipboardService() {
        // Start the ClipboardService to monitor clipboard changes
        Intent serviceIntent = new Intent(this, ClipboardService.class);
        startService(serviceIntent);
    }
}