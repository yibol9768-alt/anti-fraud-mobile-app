package expo.modules.a30guardian

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.provider.Telephony
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class GuardianForegroundService : Service() {
  companion object {
    private const val CHANNEL_ID = "a30_guardian_monitoring"
    private const val CHANNEL_NAME = "A30 守护监控"
    private const val FOREGROUND_NOTIFICATION_ID = 30030
    private const val ALERT_NOTIFICATION_ID = 30031
    private const val PREFS_NAME = "a30_guardian_prefs"
    private const val KEY_LAST_SMS_DATE = "guardian_last_sms_date"
    private const val KEY_LAST_MEDIA_DATE = "guardian_last_media_date"

    fun start(context: Context) {
      val intent = Intent(context, GuardianForegroundService::class.java)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, GuardianForegroundService::class.java))
    }
  }

  private var smsObserver: ContentObserver? = null
  private var mediaObserver: ContentObserver? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startForeground(FOREGROUND_NOTIFICATION_ID, buildForegroundNotification("正在监控短信与系统图库变化"))
    registerObservers()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    registerObservers()
    scanLatestSms(force = false)
    scanLatestMedia(force = false)
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterObservers()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun registerObservers() {
    if (smsObserver == null && hasPermission(Manifest.permission.READ_SMS)) {
      smsObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) {
          scanLatestSms(force = false)
        }
      }
      contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, smsObserver!!)
    }

    if (mediaObserver == null && hasMediaPermission()) {
      mediaObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) {
          scanLatestMedia(force = false)
        }
      }
      contentResolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, mediaObserver!!)
    }
  }

  private fun unregisterObservers() {
    smsObserver?.let { contentResolver.unregisterContentObserver(it) }
    mediaObserver?.let { contentResolver.unregisterContentObserver(it) }
    smsObserver = null
    mediaObserver = null
  }

  private fun scanLatestSms(force: Boolean) {
    if (!hasPermission(Manifest.permission.READ_SMS)) {
      return
    }

    val lastSeen = prefs().getLong(KEY_LAST_SMS_DATE, 0L)
    val projection = arrayOf(
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE,
    )

    contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      null,
      null,
      "${Telephony.Sms.DATE} DESC"
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val date = cursor.getLong(cursor.getColumnIndexOrThrow(Telephony.Sms.DATE))
        if (!force && date <= lastSeen) {
          break
        }

        val address = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: "未知号码"
        val body = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""
        val evaluation = GuardianRiskHeuristics.evaluateSms(address, body)

        if (evaluation.score >= 65) {
          notifyAlert(
            title = "A30 发现可疑短信",
            content = "来自 $address：${evaluation.summary}"
          )
        }

        if (date > lastSeen) {
          prefs().edit().putLong(KEY_LAST_SMS_DATE, date).apply()
        }
      }
    }
  }

  private fun scanLatestMedia(force: Boolean) {
    if (!hasMediaPermission()) {
      return
    }

    val lastSeen = prefs().getLong(KEY_LAST_MEDIA_DATE, 0L)
    val projection = arrayOf(
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.DATE_ADDED,
      MediaStore.MediaColumns.MIME_TYPE,
    )

    contentResolver.query(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      projection,
      null,
      null,
      "${MediaStore.MediaColumns.DATE_ADDED} DESC"
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        val created = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)) * 1000L
        if (!force && created <= lastSeen) {
          break
        }

        val filename = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)) ?: "新图片"
        val mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)) ?: "image/*"

        if (GuardianRiskHeuristics.looksLikeScreenshot(filename, mimeType)) {
          notifyAlert(
            title = "A30 发现待复核图片",
            content = "检测到新截图或疑似聊天图片：$filename"
          )
        }

        if (created > lastSeen) {
          prefs().edit().putLong(KEY_LAST_MEDIA_DATE, created).apply()
        }
      }
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
      description = "A30 在您明确开启后持续监控短信和图库变化，并通过常驻通知保持可见。"
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildForegroundNotification(content: String): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("A30 守护中心正在运行")
      .setContentText(content)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setOngoing(true)
      .setContentIntent(createLaunchIntent())
      .build()
  }

  private fun notifyAlert(title: String, content: String) {
    val manager = getSystemService(NotificationManager::class.java)
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(content)
      .setStyle(NotificationCompat.BigTextStyle().bigText(content))
      .setSmallIcon(android.R.drawable.ic_dialog_alert)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(createLaunchIntent())
      .build()

    manager.notify(ALERT_NOTIFICATION_ID, notification)
  }

  private fun createLaunchIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    return PendingIntent.getActivity(this, 1, launchIntent, flags)
  }

  private fun prefs() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun hasPermission(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(this, permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
  }

  private fun hasMediaPermission(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      hasPermission(Manifest.permission.READ_MEDIA_IMAGES)
    } else {
      hasPermission(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
  }
}

internal object GuardianRiskHeuristics {
  private val urgentKeywords = listOf("立即", "马上", "尽快", "冻结", "解冻", "异常", "核验")
  private val moneyKeywords = listOf("转账", "汇款", "打款", "提现", "退款", "赔付", "投资", "收益")
  private val credentialKeywords = listOf("验证码", "链接", "点击", "账户", "银行卡", "密码", "客服")
  private val screenshotHints = listOf("screenshot", "screen_shot", "截屏", "截图", "wechat", "whatsapp", "telegram")
  private val urlRegex = Regex("https?://|www\\.", RegexOption.IGNORE_CASE)

  data class SmsEvaluation(
    val score: Int,
    val reasons: List<String>,
    val summary: String,
  )

  fun evaluateSms(address: String, body: String): SmsEvaluation {
    var score = 20
    val reasons = mutableListOf<String>()
    val normalized = body.lowercase()

    if (urlRegex.containsMatchIn(body)) {
      score += 25
      reasons += "包含跳转链接"
    }
    if (urgentKeywords.any { normalized.contains(it.lowercase()) }) {
      score += 18
      reasons += "出现催促或异常处理语气"
    }
    if (moneyKeywords.any { normalized.contains(it.lowercase()) }) {
      score += 20
      reasons += "涉及转账、退款或投资等资金话术"
    }
    if (credentialKeywords.any { normalized.contains(it.lowercase()) }) {
      score += 18
      reasons += "涉及验证码、账户或客服指引"
    }
    if (address.startsWith("+")) {
      score += 8
      reasons += "疑似境外或非常规号码"
    }

    val safeScore = score.coerceAtMost(100)
    val summary = when {
      reasons.isEmpty() -> "建议回到 A30 进行进一步复核"
      reasons.size == 1 -> reasons.first()
      else -> reasons.take(2).joinToString("，")
    }

    return SmsEvaluation(safeScore, reasons, summary)
  }

  fun looksLikeScreenshot(filename: String, mimeType: String): Boolean {
    val normalized = filename.lowercase()
    return mimeType.startsWith("image/") && screenshotHints.any { normalized.contains(it) }
  }
}
