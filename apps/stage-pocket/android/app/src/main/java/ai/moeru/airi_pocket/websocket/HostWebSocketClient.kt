package ai.moeru.airi_pocket.websocket

import okhttp3.OkHttpClient
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import javax.security.auth.x500.X500Principal

// NOTICE: Tamagotchi can issue a local AIRI root CA for WSS on LAN IPs.
// Pocket does not import that CA into Android's system trust store, so the native
// websocket bridge has to accept that very specific certificate shape itself.
// The hostname/SAN check still runs in OkHttp after trust validation.
fun createHostWebSocketClient(): OkHttpClient {
    val trustManager = AiriHostWebSocketTrustManager()
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf<TrustManager>(trustManager), SecureRandom())

    return OkHttpClient.Builder()
        .sslSocketFactory(sslContext.socketFactory, trustManager)
        .build()
}

private class AiriHostWebSocketTrustManager(
    private val platformTrustManager: X509TrustManager = createPlatformTrustManager(),
) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
        platformTrustManager.checkClientTrusted(chain, authType)
    }

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
        try {
            platformTrustManager.checkServerTrusted(chain, authType)
        }
        catch (error: CertificateException) {
            val leaf = chain.firstOrNull()
            if (leaf == null || !looksLikeAiriServerCertificate(leaf)) {
                throw error
            }

            leaf.checkValidity()
        }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = platformTrustManager.acceptedIssuers
}

private fun createPlatformTrustManager(): X509TrustManager {
    val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    factory.init(null as KeyStore?)

    return factory.trustManagers
        .filterIsInstance<X509TrustManager>()
        .first()
}

private fun looksLikeAiriServerCertificate(certificate: X509Certificate): Boolean {
    val subject = certificate.subjectX500Principal
    val issuer = certificate.issuerX500Principal

    return subject.attribute("CN") == "localhost"
        && issuer.attribute("CN") == "AIRI"
        && issuer.attribute("C") == "US"
        && issuer.attribute("L") == "Local"
        && issuer.attribute("O") == "AIRI"
}

private fun X500Principal.attribute(key: String): String? =
    name
        .split(',')
        .map { it.trim() }
        .firstNotNullOfOrNull { entry ->
            val parts = entry.split('=', limit = 2)
            if (parts.size != 2) {
                return@firstNotNullOfOrNull null
            }

            if (parts[0].equals(key, ignoreCase = true)) {
                return@firstNotNullOfOrNull parts[1]
            }

            null
        }
