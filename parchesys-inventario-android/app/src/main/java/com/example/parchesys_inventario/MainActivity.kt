package com.example.parchesys_inventario

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import androidx.biometric.BiometricPrompt
import androidx.biometric.BiometricManager
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import android.content.pm.PackageManager
import android.Manifest
import java.util.concurrent.Executor
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.os.Build
import java.util.UUID

class MainActivity : FragmentActivity() {
    private lateinit var webView: WebView
    
    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo
    
    private val PERMISSIONS_REQUEST_CODE = 1001

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        
        // Enable Chrome DevTools debugging for WebView
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        webView.webViewClient = object : WebViewClient() {
            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(
                view: WebView?,
                handler: android.webkit.SslErrorHandler?,
                error: android.net.http.SslError?
            ) {
                handler?.proceed() // Bypass SSL errors (important for older tablets/Android versions)
            }
        }
        
        // Configure WebChromeClient to grant geolocation and camera permissions inside the web page
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, true, false)
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    // Grant web page resource permissions (like Camera) inside WebView
                    request.grant(request.resources)
                }
            }
        }
        
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.setGeolocationEnabled(true)
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.mediaPlaybackRequiresUserGesture = false
        
        // Setup biometric authentication callbacks
        setupBiometricPrompt()
        
        // Expose AndroidBridge interface to JavaScript
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
        
        // Load local assets HTML file
        webView.loadUrl("file:///android_asset/inventario-tablet.html?tablet=true")
        
        setContentView(webView)
        
        // Request runtime permissions (GPS location and Camera) at startup
        checkAndRequestPermissions()
    }
    
    private fun checkAndRequestPermissions() {
        val permissionsList = ArrayList<String>()
        permissionsList.add(Manifest.permission.ACCESS_FINE_LOCATION)
        permissionsList.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        permissionsList.add(Manifest.permission.CAMERA)

        // Request Bluetooth Connect and Scan on Android 12+ (API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissionsList.add(Manifest.permission.BLUETOOTH_CONNECT)
            permissionsList.add(Manifest.permission.BLUETOOTH_SCAN)
        }

        val listPermissionsNeeded = ArrayList<String>()
        for (p in permissionsList) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                listPermissionsNeeded.add(p)
            }
        }
        if (listPermissionsNeeded.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                listPermissionsNeeded.toTypedArray(),
                PERMISSIONS_REQUEST_CODE
            )
        }
    }

    private fun setupBiometricPrompt() {
        executor = ContextCompat.getMainExecutor(this)
        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    // If user cancels or it times out, notify JS
                    runOnUiThread {
                        webView.evaluateJavascript("javascript:bioCancelado()", null)
                    }
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    // Successful scan, notify JS
                    runOnUiThread {
                        webView.evaluateJavascript("javascript:bioExito()", null)
                    }
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    // System prompt automatically shows "not recognized", standard BiometricPrompt handles retries.
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Autenticación biométrica")
            .setSubtitle("Usa tu huella o rostro para registrar asistencia")
            .setNegativeButtonText("Cancelar")
            .build()
    }

    private fun showBiometricPrompt() {
        val biometricManager = BiometricManager.from(this)
        val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.BIOMETRIC_WEAK
        
        val canAuthenticate = biometricManager.canAuthenticate(authenticators)
        if (canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS) {
            biometricPrompt.authenticate(promptInfo)
        } else {
            // Hardware missing, not enrolled, or unsupported - trigger camera fallback in JS
            runOnUiThread {
                Toast.makeText(
                    this,
                    "Biometría no disponible. Iniciando verificación por foto selfie.",
                    Toast.LENGTH_LONG
                ).show()
                webView.evaluateJavascript("javascript:bioNoDisponible()", null)
            }
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun authenticateBiometrics() {
            runOnUiThread {
                showBiometricPrompt()
            }
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        fun printBluetooth(ticketText: String) {
            runOnUiThread {
                Thread {
                    try {
                        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
                        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                            runOnUiThread {
                                Toast.makeText(this@MainActivity, "Bluetooth desactivado", Toast.LENGTH_SHORT).show()
                            }
                            return@Thread
                        }

                        // Check BLUETOOTH_CONNECT permission on Android 12+ (API 31+)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            if (ContextCompat.checkSelfPermission(
                                    this@MainActivity,
                                    Manifest.permission.BLUETOOTH_CONNECT
                                ) != PackageManager.PERMISSION_GRANTED
                            ) {
                                runOnUiThread {
                                    Toast.makeText(this@MainActivity, "Permiso de Bluetooth no concedido", Toast.LENGTH_SHORT).show()
                                }
                                return@Thread
                            }
                        }

                        val pairedDevices = bluetoothAdapter.bondedDevices
                        val printerDevice = pairedDevices.find { device ->
                            val name = device.name?.lowercase() ?: ""
                            name.contains("pt-210") || name.contains("pt210") || name.contains("printer") ||
                            name.contains("pos") || name.contains("mtp") || name.contains("thermal")
                        } ?: pairedDevices.firstOrNull()

                        if (printerDevice == null) {
                            runOnUiThread {
                                Toast.makeText(this@MainActivity, "No se encontró ninguna impresora vinculada", Toast.LENGTH_SHORT).show()
                            }
                            return@Thread
                        }

                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Imprimiendo en " + printerDevice.name, Toast.LENGTH_SHORT).show()
                        }

                        val sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
                        val socket = printerDevice.createRfcommSocketToServiceRecord(sppUuid)
                        socket.connect()

                        val outputStream = socket.outputStream

                        // ESC/POS Initialization
                        outputStream.write(byteArrayOf(0x1B, 0x40)) // ESC @ (Initialize printer)

                        val lines = ticketText.split("\n")
                        for (line in lines) {
                            var currentLine = line

                            // Alignments
                            if (currentLine.startsWith("[C]")) {
                                outputStream.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
                                currentLine = currentLine.substring(3)
                            } else if (currentLine.startsWith("[R]")) {
                                outputStream.write(byteArrayOf(0x1B, 0x61, 0x02)) // Right
                                currentLine = currentLine.substring(3)
                            } else {
                                outputStream.write(byteArrayOf(0x1B, 0x61, 0x00)) // Left
                                if (currentLine.startsWith("[L]")) {
                                    currentLine = currentLine.substring(3)
                                }
                            }

                            // Bold & Double size flags
                            var isBold = false
                            var isDouble = false
                            if (currentLine.contains("[B]")) {
                                isBold = true
                                currentLine = currentLine.replace("[B]", "").replace("[/B]", "")
                            }
                            if (currentLine.contains("[D]")) {
                                isDouble = true
                                currentLine = currentLine.replace("[D]", "").replace("[/D]", "")
                            }

                            // Write formatting parameters
                            if (isBold) {
                                outputStream.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold on
                            } else {
                                outputStream.write(byteArrayOf(0x1B, 0x45, 0x00)) // Bold off
                            }

                            if (isDouble) {
                                outputStream.write(byteArrayOf(0x1D, 0x21, 0x11)) // Double size
                            } else {
                                outputStream.write(byteArrayOf(0x1D, 0x21, 0x00)) // Normal size
                            }

                            // Write horizontal line helper tag
                            if (currentLine == "[HR]") {
                                currentLine = "--------------------------------"
                            }

                            // Send string encoded as ISO-8859-1 for Spanish accents support
                            outputStream.write(currentLine.toByteArray(charset("ISO-8859-1")))
                            outputStream.write(byteArrayOf(0x0A)) // Newline
                        }

                        // Feed lines and cut
                        outputStream.write(byteArrayOf(0x0A, 0x0A, 0x0A, 0x0A)) // Feed 4 lines
                        outputStream.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // Cut paper (if supported)

                        outputStream.flush()
                        socket.close()

                    } catch (e: Exception) {
                        e.printStackTrace()
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, "Error de impresión: " + e.message, Toast.LENGTH_LONG).show()
                        }
                    }
                }.start()
            }
        }

        private fun regexExtract(text: String, patternStr: String): String? {
            return try {
                val pattern = java.util.regex.Pattern.compile(patternStr)
                val matcher = pattern.matcher(text)
                if (matcher.find()) {
                    matcher.group(1)
                } else {
                    null
                }
            } catch (e: Exception) {
                null
            }
        }

        @JavascriptInterface
        fun enviarCobroPAX(ip: String, puerto: Int, monto: Double, factura: String) {
            runOnUiThread {
                Thread {
                    var socket: java.net.Socket? = null
                    try {
                        socket = java.net.Socket()
                        // Connection Timeout: 10s
                        socket.connect(java.net.InetSocketAddress(ip, puerto), 10000)
                        // Read Timeout: 60s
                        socket.soTimeout = 60000
                        
                        val outputStream = socket.getOutputStream()
                        val inputStream = socket.getInputStream()
                        
                        val STX = 0x02.toChar()
                        val ETX = 0x03.toChar()
                        val montoCentavos = Math.round(monto * 100)
                        val trama = "$STX" + "TIPO=VENTA|MONTO=$montoCentavos|FAC=$factura" + "$ETX"
                        
                        outputStream.write(trama.toByteArray(charset("ISO-8859-1")))
                        outputStream.flush()
                        
                        val buffer = ByteArray(2048)
                        val bytesRead = inputStream.read(buffer)
                        if (bytesRead > 0) {
                            val respuesta = String(buffer, 0, bytesRead, charset("ISO-8859-1"))
                            if (respuesta.contains("RESP=00") || respuesta.contains("RC=00") || respuesta.contains("APROBADO") || respuesta.contains("RES=00")) {
                                val auth = regexExtract(respuesta, "AUTH=([^|]+)") ?: "000000"
                                val brand = regexExtract(respuesta, "MARCA=([^|]+)") ?: "VISA"
                                val last4 = regexExtract(respuesta, "LAST4=([^|]+)") ?: "0000"
                                val rrn = regexExtract(respuesta, "RRN=([^|]+)") ?: "000000"
                                
                                runOnUiThread {
                                    webView.evaluateJavascript("javascript:window.onPaxPaymentSuccess && window.onPaxPaymentSuccess('$auth', '$brand', '$last4', '$rrn')", null)
                                }
                            } else {
                                val errorMsg = regexExtract(respuesta, "MSG=([^|]+)") ?: regexExtract(respuesta, "MESSAGE=([^|]+)") ?: "Transacción denegada"
                                runOnUiThread {
                                    webView.evaluateJavascript("javascript:window.onPaxPaymentFailed && window.onPaxPaymentFailed('$errorMsg')", null)
                                }
                            }
                        } else {
                            runOnUiThread {
                                webView.evaluateJavascript("javascript:window.onPaxPaymentFailed && window.onPaxPaymentFailed('No se recibió respuesta de la terminal')", null)
                            }
                        }
                    } catch (e: java.net.SocketTimeoutException) {
                        runOnUiThread {
                            webView.evaluateJavascript("javascript:window.onPaxPaymentFailed && window.onPaxPaymentFailed('Tiempo de espera agotado en terminal PAX')", null)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                        runOnUiThread {
                            webView.evaluateJavascript("javascript:window.onPaxPaymentFailed && window.onPaxPaymentFailed('Error de conexión con PAX: ${e.message}')", null)
                        }
                    } finally {
                        try {
                            socket?.close()
                        } catch (ex: Exception) {
                            ex.printStackTrace()
                        }
                    }
                }.start()
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
