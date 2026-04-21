package expo.modules.a30guardian

import android.Manifest
import android.app.NotificationManager
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class A30GuardianModule : Module() {
  companion object {
    private const val PREFS_NAME = "a30_guardian_prefs"
    private const val KEY_MONITORING_ENABLED = "guardian_monitoring_enabled"
    private const val DEFAULT_SMS_LIMIT = 50
    private const val DEFAULT_MEDIA_LIMIT = 60
  }

  override fun definition() = ModuleDefinition {
    Name("A30Guardian")

    Events("onSmsReceived", "onMediaDiscovered", "onScanProgress")

    AsyncFunction("getBootstrapStateAsync") {
      mapOf(
        "canAutoMonitor" to true,
        "permissionState" to currentPermissionState(),
        "smsSupported" to true,
        "mediaSupported" to true,
        "nativeWatcherSupported" to true,
      )
    }

    AsyncFunction("requestGuardianPermissionsAsync") {
      currentPermissionState()
    }

    AsyncFunction("getRecentSmsAsync") { options: Map<String, Any?>? ->
      querySms(options)
    }

    AsyncFunction("startSmsScanAsync") { options: Map<String, Any?>? ->
      sendProgress(
        source = "sms",
        stage = "running",
        scanned = 0,
        total = null,
        cursor = null,
        message = "开始扫描短信",
      )

      val records = querySms(options)

      sendProgress(
        source = "sms",
        stage = "completed",
        scanned = records.size,
        total = records.size,
        cursor = null,
        message = "短信扫描完成",
      )

      records
    }

    AsyncFunction("startMediaScanAsync") { options: Map<String, Any?>? ->
      sendProgress(
        source = "media",
        stage = "running",
        scanned = 0,
        total = null,
        cursor = null,
        message = "开始扫描系统图库",
      )

      val records = queryImages(options)
      records.forEach { record ->
        sendEvent("onMediaDiscovered", mapOf("record" to record))
      }

      sendProgress(
        source = "media",
        stage = "completed",
        scanned = records.size,
        total = records.size,
        cursor = null,
        message = "图库扫描完成",
      )

      records
    }

    AsyncFunction("startGuardianMonitoringAsync") {
      val context = requireContext()
      setMonitoringEnabled(true)
      GuardianForegroundService.start(context)
      sendProgress(
        source = "watcher",
        stage = "completed",
        scanned = 0,
        total = 0,
        cursor = null,
        message = "后台监控已启用，并已启动可见守护服务",
      )
      true
    }

    AsyncFunction("stopGuardianMonitoringAsync") {
      val context = requireContext()
      setMonitoringEnabled(false)
      GuardianForegroundService.stop(context)
      sendProgress(
        source = "watcher",
        stage = "completed",
        scanned = 0,
        total = 0,
        cursor = null,
        message = "后台监控已关闭，并已停止守护服务",
      )
      true
    }

    AsyncFunction("isGuardianMonitoringActiveAsync") {
      isMonitoringEnabled()
    }

    View(A30GuardianView::class) {
      Prop("url") { view: A30GuardianView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      Events("onLoad")
    }
  }

  private fun currentPermissionState(): Map<String, Any> {
    val context = requireContext()
    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

    return mapOf(
      "smsGranted" to hasPermission(context, Manifest.permission.READ_SMS),
      "mediaGranted" to hasMediaPermission(context),
      "notificationsGranted" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) notificationManager.areNotificationsEnabled() else true,
      "batteryOptimizationIgnored" to powerManager.isIgnoringBatteryOptimizations(context.packageName),
    )
  }

  private fun requireContext(): Context {
    return appContext.reactContext ?: appContext.currentActivity ?: throw IllegalStateException("Android context unavailable")
  }

  private fun hasPermission(context: Context, permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun hasMediaPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      hasPermission(context, Manifest.permission.READ_MEDIA_IMAGES)
    } else {
      hasPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE)
    }
  }

  private fun querySms(options: Map<String, Any?>?): List<Map<String, Any?>> {
    val context = requireContext()
    if (!hasPermission(context, Manifest.permission.READ_SMS)) {
      sendProgress(
        source = "sms",
        stage = "error",
        scanned = 0,
        total = 0,
        cursor = null,
        message = "缺少短信读取权限",
      )
      return emptyList()
    }

    val limit = (options?.get("limit") as? Number)?.toInt()?.coerceIn(1, 500) ?: DEFAULT_SMS_LIMIT
    val since = (options?.get("since") as? Number)?.toLong()
    val rows = mutableListOf<Map<String, Any?>>()

    val projection = arrayOf(
      Telephony.Sms._ID,
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE,
      Telephony.Sms.TYPE,
      Telephony.Sms.READ,
    )

    val selection = if (since != null) "${Telephony.Sms.DATE} > ?" else null
    val selectionArgs = if (since != null) arrayOf(since.toString()) else null

    context.contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      selection,
      selectionArgs,
      "${Telephony.Sms.DATE} DESC",
    )?.use { cursor ->
      while (cursor.moveToNext() && rows.size < limit) {
        val record = mapSmsCursor(cursor)
        rows.add(record)
        sendEvent("onSmsReceived", mapOf("record" to record))
      }
    }

    return rows
  }

  private fun queryImages(options: Map<String, Any?>?): List<Map<String, Any?>> {
    val context = requireContext()
    if (!hasMediaPermission(context)) {
      sendProgress(
        source = "media",
        stage = "error",
        scanned = 0,
        total = 0,
        cursor = null,
        message = "缺少图库读取权限",
      )
      return emptyList()
    }

    val limit = (options?.get("pageSize") as? Number)?.toInt()?.coerceIn(1, 300) ?: DEFAULT_MEDIA_LIMIT
    val includeVideos = (options?.get("includeVideos") as? Boolean) == true
    val collection: Uri = if (includeVideos) {
      MediaStore.Files.getContentUri("external")
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }

    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.DATE_ADDED,
      MediaStore.MediaColumns.WIDTH,
      MediaStore.MediaColumns.HEIGHT,
      MediaStore.MediaColumns.MIME_TYPE,
    )

    val selection = if (includeVideos) {
      "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"
    } else {
      null
    }
    val selectionArgs = if (includeVideos) {
      arrayOf(
        MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
        MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
      )
    } else {
      null
    }

    val rows = mutableListOf<Map<String, Any?>>()

    context.contentResolver.query(
      collection,
      projection,
      selection,
      selectionArgs,
      "${MediaStore.MediaColumns.DATE_ADDED} DESC",
    )?.use { cursor ->
      while (cursor.moveToNext() && rows.size < limit) {
        rows.add(mapMediaCursor(cursor, collection))
      }
    }

    return rows
  }

  private fun mapSmsCursor(cursor: Cursor): Map<String, Any?> {
    val id = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms._ID))
    val address = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: "未知号码"
    val body = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""
    val date = cursor.getLong(cursor.getColumnIndexOrThrow(Telephony.Sms.DATE))
    val type = cursor.getInt(cursor.getColumnIndexOrThrow(Telephony.Sms.TYPE)).toString()
    val read = cursor.getInt(cursor.getColumnIndexOrThrow(Telephony.Sms.READ)) == 1

    return mapOf(
      "id" to id,
      "address" to address,
      "body" to body,
      "date" to date,
      "type" to type,
      "read" to read,
    )
  }

  private fun mapMediaCursor(cursor: Cursor, collection: Uri): Map<String, Any?> {
    val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID))
    val fileUri = ContentUris.withAppendedId(collection, id).toString()
    val name = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)) ?: "未命名文件"
    val created = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)) * 1000L
    val width = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH))
    val height = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT))
    val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)) ?: ""

    val mediaType = when {
      mimeType.startsWith("image/") -> "photo"
      mimeType.startsWith("video/") -> "video"
      else -> "unknown"
    }

    return mapOf(
      "id" to id.toString(),
      "uri" to fileUri,
      "filename" to name,
      "mediaType" to mediaType,
      "creationTime" to created,
      "width" to width,
      "height" to height,
      "albumId" to null,
    )
  }

  private fun prefs() = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun setMonitoringEnabled(enabled: Boolean) {
    prefs().edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
  }

  private fun isMonitoringEnabled(): Boolean {
    return prefs().getBoolean(KEY_MONITORING_ENABLED, false)
  }

  private fun sendProgress(
    source: String,
    stage: String,
    scanned: Int,
    total: Int?,
    cursor: String?,
    message: String,
  ) {
    sendEvent(
      "onScanProgress",
      mapOf(
        "progress" to mapOf(
          "stage" to stage,
          "source" to source,
          "scanned" to scanned,
          "total" to total,
          "cursor" to cursor,
          "message" to message,
        )
      )
    )
  }
}
