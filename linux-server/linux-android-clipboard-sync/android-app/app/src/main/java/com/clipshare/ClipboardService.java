import android.app.Service;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

public class ClipboardService extends Service {
    private static final String TAG = "ClipboardService";
    private ClipboardManager clipboardManager;
    private ClipboardManager.OnPrimaryClipChangedListener clipChangedListener;

    @Override
    public void onCreate() {
        super.onCreate();
        clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        clipChangedListener = new ClipboardManager.OnPrimaryClipChangedListener() {
            @Override
            public void onPrimaryClipChanged() {
                ClipData clipData = clipboardManager.getPrimaryClip();
                if (clipData != null && clipData.getItemCount() > 0) {
                    String clipboardText = clipData.getItemAt(0).getText().toString();
                    sendClipboardDataToServer(clipboardText);
                }
            }
        };
        clipboardManager.addPrimaryClipChangedListener(clipChangedListener);
    }

    private void sendClipboardDataToServer(String clipboardText) {
        // Implement WebSocket communication to send clipboardText to the server
        Log.d(TAG, "Sending clipboard data to server: " + clipboardText);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        clipboardManager.removePrimaryClipChangedListener(clipChangedListener);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}