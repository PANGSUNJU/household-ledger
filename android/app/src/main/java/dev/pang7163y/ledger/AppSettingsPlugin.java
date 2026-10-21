package dev.pang7163y.ledger;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 폰의 '이 앱 알림 설정' 화면 열기 (알림을 한 번 거절하면 앱이 다시 물어볼 수 없어서)
 */
@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void openNotifications(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("설정 화면을 열지 못했어요", e);
        }
    }

    /** 이 앱 알림이 켜져 있는지 (안드로이드에 바로 묻기) + 안드로이드 버전 */
    @PluginMethod
    public void notifyStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }
}
