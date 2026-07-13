package com.krishna.assistant

import org.junit.Assert.assertEquals
import org.junit.Test

class HandsFreeCommandParserTest {
  @Test
  fun extractsNaturalButtonPhrases() {
    assertEquals("play", HandsFreeCommandParser.extractButtonLabel("click on the play button"))
    assertEquals("pause", HandsFreeCommandParser.extractButtonLabel("tap the pause control"))
    assertEquals("next", HandsFreeCommandParser.extractButtonLabel("press on next icon"))
  }

  @Test
  fun rejectsIncompleteButtonPhrases() {
    assertEquals(null, HandsFreeCommandParser.extractButtonLabel("click on the button"))
    assertEquals(null, HandsFreeCommandParser.extractButtonLabel("play the song"))
  }

  @Test
  fun extractsDirectMediaPhrases() {
    assertEquals("play", HandsFreeCommandParser.extractMediaAction("play the song"))
    assertEquals("play", HandsFreeCommandParser.extractMediaAction("resume"))
    assertEquals("pause", HandsFreeCommandParser.extractMediaAction("pause the music"))
    assertEquals("next", HandsFreeCommandParser.extractMediaAction("skip song"))
  }

  @Test
  fun keepsSongRequestsOutOfDirectMediaControls() {
    assertEquals(null, HandsFreeCommandParser.extractMediaAction("play malan"))
  }
}
