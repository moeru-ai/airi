package ai.moeru.airi_pocket

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BackgroundWakeWordContractTest {
    @Test
    fun preservesCharacterAndPronunciationParameters() {
        val keywords = parseKeywords(JSONArray("""[
            {"characterId":"character-a","tokens":["n","i3"],"score":1.2,"threshold":0.4},
            {"characterId":"character-b","tokens":["h","ao3"]}
        ]"""))

        assertEquals("character-a", keywords[0].characterId)
        assertEquals(listOf("n", "i3"), keywords[0].tokens)
        assertEquals(1.2f, keywords[0].score)
        assertEquals(0.4f, keywords[0].threshold)
        assertEquals("character-b", keywords[1].characterId)
        assertEquals(null, keywords[1].score)
        assertEquals(null, keywords[1].threshold)
    }

    @Test
    fun rejectsKeywordsWithoutACharacterOwner() {
        assertThrows(JSONException::class.java) {
            parseKeywords(JSONArray("""[{"tokens":["n","i3"]}]"""))
        }
    }

    @Test
    fun preservesTranslatedNotificationLabels() {
        val text = parseNotificationText(notificationText())

        assertEquals("称呼监听", text.listeningChannel)
        assertEquals("检测到称呼", text.matchChannel)
        assertEquals("AIRI 正在监听称呼", text.listeningTitle)
        assertEquals("点击打开 AIRI", text.listeningBody)
        assertEquals("AIRI 听到了称呼", text.matchTitle)
        assertEquals("点击开始说话", text.matchBody)
        assertEquals("监听已停止", text.errorTitle)
        assertEquals("打开 Pocket 重新启动监听", text.errorBody)
    }

    @Test
    fun rejectsMissingNotificationLabels() {
        val missing = notificationText().apply { remove("matchBody") }

        assertThrows(JSONException::class.java) { parseNotificationText(missing) }
    }

    @Test
    fun rejectsBlankNotificationLabels() {
        val blank = notificationText().apply { put("listeningTitle", " ") }

        assertThrows(IllegalArgumentException::class.java) { parseNotificationText(blank) }
    }

    private fun notificationText(): JSONObject = JSONObject("""{
        "listeningChannel":"称呼监听",
        "matchChannel":"检测到称呼",
        "listeningTitle":"AIRI 正在监听称呼",
        "listeningBody":"点击打开 AIRI",
        "matchTitle":"AIRI 听到了称呼",
        "matchBody":"点击开始说话",
        "errorTitle":"监听已停止",
        "errorBody":"打开 Pocket 重新启动监听"
    }""")
}
