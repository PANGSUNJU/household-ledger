package dev.pang7163y.ledger;

import android.content.Context;
import android.graphics.Rect;
import android.net.Uri;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * 시험용 (mlkit-lab 브랜치에서만): 가짜 캡처 조각을 앱과 같은 방법(파일 경로 → InputImage.fromFilePath, 한국어)으로
 * ML Kit 에 넣고, 플러그인이 돌려주는 모양(blocks → lines, boundingBox) 그대로 JSON 으로 남긴다.
 */
@RunWith(AndroidJUnit4.class)
public class MlkitProbeTest {

    private static JSONObject box(Rect r) throws Exception {
        JSONObject o = new JSONObject();
        if (r == null) return o;
        o.put("left", r.left);
        o.put("top", r.top);
        o.put("right", r.right);
        o.put("bottom", r.bottom);
        return o;
    }

    @Test
    public void probe() throws Exception {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        TextRecognizer rec = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
        File outDir = new File(app.getExternalFilesDir(null), "probe");
        outDir.mkdirs();
        String[] names = test.getAssets().list("probe");
        for (String n : names) {
            File f = new File(app.getCacheDir(), n);
            try (InputStream in = test.getAssets().open("probe/" + n); OutputStream o = new FileOutputStream(f)) {
                byte[] buf = new byte[65536];
                int k;
                while ((k = in.read(buf)) > 0) o.write(buf, 0, k);
            }
            long t0 = System.currentTimeMillis();
            InputImage img = InputImage.fromFilePath(app, Uri.fromFile(f));
            Text t = Tasks.await(rec.process(img), 120, TimeUnit.SECONDS);
            JSONObject j = new JSONObject();
            j.put("file", n);
            j.put("w", img.getWidth());
            j.put("h", img.getHeight());
            j.put("ms", System.currentTimeMillis() - t0);
            j.put("text", t.getText());
            JSONArray blocks = new JSONArray();
            for (Text.TextBlock b : t.getTextBlocks()) {
                JSONObject bo = new JSONObject();
                bo.put("text", b.getText());
                bo.put("boundingBox", box(b.getBoundingBox()));
                JSONArray lines = new JSONArray();
                for (Text.Line l : b.getLines()) {
                    JSONObject lo = new JSONObject();
                    lo.put("text", l.getText());
                    lo.put("boundingBox", box(l.getBoundingBox()));
                    lines.put(lo);
                }
                bo.put("lines", lines);
                blocks.put(bo);
            }
            j.put("blocks", blocks);
            String s = j.toString();
            try (OutputStream o = new FileOutputStream(new File(outDir, n + ".json"))) {
                o.write(s.getBytes("UTF-8"));
            }
            // adb pull 이 안 될 때를 위해 logcat 에도 조각내서 남긴다
            for (int i = 0; i < s.length(); i += 3000) {
                Log.i("MLKITPROBE", n + "|" + (i / 3000) + "|" + s.substring(i, Math.min(s.length(), i + 3000)));
            }
            Log.i("MLKITPROBE", n + "|END|" + img.getWidth() + "x" + img.getHeight() + " " + (System.currentTimeMillis() - t0) + "ms");
        }
    }
}
