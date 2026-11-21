#!/bin/bash
set -e
ROOT="/d/dshwork/pubg测距"
SDK="$ROOT/build/android-sdk"
TOOLS="/c/temp/sdk/bt"
AJ="/c/temp/sdk/android.jar"
STAGE="/c/temp/pubgbuild"
AND="$STAGE/android"
OUT="$ROOT/dist"
JAVA_HOME="/d/jdk-23.0.2"
JAVAC="$JAVA_HOME/bin/javac"
KEYTOOL="$JAVA_HOME/bin/keytool"

echo "== 0. 准备工具（复制到 C: 解除限制）=="
mkdir -p /c/temp/sdk
if [ ! -f "$TOOLS/aapt2.exe" ]; then
  cp -r "$SDK/build-tools/34.0.0" "$TOOLS"
fi
if [ ! -f "$AJ" ]; then
  cp "$SDK/platforms/android-34/android.jar" "$AJ"
fi

echo "== 1. 同步工程与 web 资源 =="
mkdir -p "$OUT"
rm -rf "$AND"
mkdir -p "$AND/gen" "$AND/classes" "$AND/dex"
cp -r "$ROOT/android/res" "$AND/"
cp "$ROOT/android/AndroidManifest.xml" "$AND/"
cp -r "$ROOT/android/java" "$AND/"
mkdir -p "$AND/assets/www"
cp "$ROOT/app/index.html" "$AND/assets/www/"
cp -r "$ROOT/app/css" "$ROOT/app/js" "$ROOT/app/data" "$AND/assets/www/"
echo "tiles: $(find "$ROOT/build/tiles" -name '*.jpg' | wc -l) 张"
cp -r "$ROOT/build/tiles" "$AND/assets/www/tiles"
du -sh "$AND/assets"

echo "== 2. aapt2 compile =="
cd "$AND"
"$TOOLS/aapt2.exe" compile --dir res -o res.zip

echo "== 3. aapt2 link =="
"$TOOLS/aapt2.exe" link \
  -o base.apk \
  -I "$AJ" \
  --manifest AndroidManifest.xml \
  --java gen \
  -A assets \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 1 --version-name 1.0 \
  res.zip
echo "link ok: $(du -h base.apk | cut -f1)"

echo "== 4. javac =="
find java gen -name '*.java' > sources.txt
"$JAVAC" --release 11 -encoding UTF-8 -classpath "$AJ" -d classes @sources.txt
echo "class files: $(find classes -name '*.class' | wc -l)"

echo "== 5. d8 =="
find classes -name '*.class' > classlist.txt
"$TOOLS/d8.bat" --min-api 24 --lib "$AJ" --output dex @classlist.txt
ls -la dex/

echo "== 6. 写入 classes.dex =="
python - <<'PY'
import zipfile, os
root = r"C:\temp\pubgbuild\android"
src = os.path.join(root, "base.apk")
dst = os.path.join(root, "unsigned.apk")
with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            zi = zipfile.ZipInfo(it.filename, date_time=it.date_time)
            zi.compress_type = zipfile.ZIP_STORED
            zout.writestr(zi, data)
        else:
            zout.writestr(it, data)
    zout.write(os.path.join(root, "dex", "classes.dex"), "classes.dex")
print("unsigned.apk", round(os.path.getsize(dst) / 1048576, 1), "MB")
PY

echo "== 7. zipalign =="
"$TOOLS/zipalign.exe" -f -p 4 unsigned.apk aligned.apk

echo "== 8. 签名 =="
if [ ! -f "$STAGE/pubgmap.keystore" ]; then
  "$KEYTOOL" -genkeypair -keystore "$STAGE/pubgmap.keystore" -alias pubgmap \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass pubgmap -keypass pubgmap \
    -dname "CN=PUBG Offline Map, OU=Personal, O=Personal, L=NA, S=NA, C=CN" >/dev/null 2>&1
fi
"$TOOLS/apksigner.bat" sign --ks "$STAGE/pubgmap.keystore" \
  --ks-pass pass:pubgmap --key-pass pass:pubgmap \
  --out "$OUT/PUBG-OfflineMap-1.0.apk" aligned.apk

echo "== 9. 校验 =="
"$TOOLS/apksigner.bat" verify --print-certs "$OUT/PUBG-OfflineMap-1.0.apk" | head -4
"$TOOLS/aapt.exe" dump badging "$OUT/PUBG-OfflineMap-1.0.apk" | head -5
ls -lh "$OUT/PUBG-OfflineMap-1.0.apk"
