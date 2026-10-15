const {
  createRunOncePlugin,
  withAndroidManifest,
} = require("@expo/config-plugins");

function withAndroidBackupRulesManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];

    if (!application) {
      throw new Error(
        "Could not resolve the Android manifest application element.",
      );
    }

    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

    const existingReplacements = application.$["tools:replace"]
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const replacements = new Set([
      ...(existingReplacements ?? []),
      "android:dataExtractionRules",
      "android:fullBackupContent",
    ]);

    application.$["tools:replace"] = [...replacements].join(",");
    return mod;
  });
}

module.exports = createRunOncePlugin(
  withAndroidBackupRulesManifest,
  "with-android-backup-rules-manifest",
  "1.0.0",
);
