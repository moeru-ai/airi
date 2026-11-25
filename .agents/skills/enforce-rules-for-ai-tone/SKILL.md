---
name: enforce-rules-for-ai-tone
description: Enforce AIRI's rules against AI boilerplate in English and Chinese text. Use when you write, translate, or review a string that users see, documentation, a code comment, a commit message, or PR or issue text. Also use when a reader says that text sounds like AI, like a chatbot, or like a template.
---

# Enforce AIRI Rules Against AI Tone

Readers recognize text that a model wrote on autopilot. They skip it, and they trust the product or the change less. Each rule below names a pattern that readers take as AI-generated text.

This skill covers AI boilerplate only. For grammar, word choice, sentence length, and terminology, obey [`simple-english`](../simple-english/SKILL.md). These rules describe patterns in text. Do not use them to claim that a person used AI.

## Content

- Delete a sentence that stays true when you change its subject.
- Say each point once. Delete a sentence that repeats the previous sentence in other words.
- Credit a claim to a named source. Do not write that experts, studies, or many users agree.
- Do not invent a cause, a number, a function, an experience, or a test result.
- Claim only what you checked. Do not call a change stable, compatible, or complete without the check.

## Leftovers From Development

Text often carries what the development process needed. The reader of the result never needed it.

- Write what the reader needs to use the result. Leave out what only the development needed.
- Development text includes a distinction that the team had to clarify, a constraint, a build goal, and an implementation note.
- To test a sentence, ask: does a reader who never saw the task hold the view that it corrects?
- If not, delete the sentence, or move it to a code comment or the PR.
- The denial forms "not X, but Y", "not just X", "Y rather than X", "不是……而是……", and "并非" often carry such a distinction.
- In text for users, do not use names from the code, such as internal states, process roles, or API fields.
- Do not leave generation residue, such as a placeholder, an opener like "Here is" or "好的，以下是", or a citation token.
- Add a subtitle, a note, or helper text only when it adds a fact to the heading or the label.

## Framing

- Do not add a sentence that only reassures the reader that something stayed the same or is absent.
- Do not narrate how you wrote or edited the text, such as the parts that you kept, skipped, or deleted.
- If the reader asked about it or expects the opposite, you can state it.
- Do not tie a fact to a larger theme, such as history, the future, an industry shift, or human nature.
- When the reader needs a decision, give one. Do not list both sides only to avoid a position.

## Openings and Endings

- Start with the subject. Do not open with the era, the industry, or the importance of the topic.
- Do not announce the next part, as in "Here is", "Let's dive in", "以下是", or "接下来让我们".
- Stop when the facts end. Do not add a summary of a short text, a lesson, a hope, or a call to action.
- Do not end with an offer of more help, a wish that the text helps, or a next-step question.

## Register

- Do not praise the reader, the question, or the idea.
- Do not open with comfort or empathy before the fact, as in "Don't worry", "别担心", or "我理解你的感受".
- Do not stage honesty or seriousness, as in "honestly" or "说句实话".
- Do not add cheer to a routine result, such as an exclamation mark or an excited word.
- Do not add certainty words, such as "clearly", "undoubtedly", "毫无疑问", or "显而易见".
- Do not use words of inflated weight, such as "pivotal", "transformative", "至关重要", or "革命性". State the effect.

## Sentence Patterns

- Count the real items. Do not force three items, three adjectives, or "首先、其次、最后".
- Do not stack sentences of the same shape for rhythm. Do not chain "不仅……更……".
- Do not ask a question and then answer it. Do not build suspense before a fact.
- Do not end a paragraph with a slogan line or a one-word sentence for emphasis.
- Do not name a false range or a false choice to sound complete, as in "from beginners to experts".
- Write "is" or "是". Do not replace it with "serves as", "stands as", "作为……而存在", or "标志着".
- Use a metaphor only when plain words cannot explain the point. Do not give feelings or intentions to software.

## Punctuation and Format

- Do not join two clauses with a dash: "—" in English, "——" or " - " in Chinese. Use a period or a comma.
- Do not bold words inside a sentence.
- Do not decorate headings, list items, comments, or commit messages with emoji or symbols, such as ✅, 🚀, or →.
- Do not give every list item a bold label and a colon.
- Do not put quotation marks around a word for emphasis.

## Chinese

- Use the verb itself. Do not write "进行" before a verb noun, "对……进行……", "通过……来……", or "被……所……".
- Break a long attribute into a short sentence. Do not chain several "的" in one phrase.
- Write in Chinese word order. Do not translate an English sentence word by word.
- Do not open each sentence with a connective, such as "此外", "值得注意的是", "换句话说", or "本质上".
- Do not use business jargon, such as "赋能", "闭环", "抓手", or "底层逻辑". Use the plain verb.
- Do not use engineering slang as everyday verbs, such as "接住", "收口", "兜底", or "落盘".

## Commit Messages, PR Text, and Comments

- Explain why the change exists. Do not list the changed files or retell the diff line by line.
- Name the change in the commit subject. Do not write "improve", "enhance", "update", or "optimize" alone.
- Report only the checks that ran. Do not write a test plan of checks that did not run.
- Leave out a template section that has nothing to say.
- In a code comment, do not narrate the change history, the request, or the conversation.

## Exceptions

- Character prompts and character cards use the voice of their character. Keep the voice.
- Marketing and brand copy uses the product voice. Examples are onboarding pitches, purchase pages, feature names, and taglines.
- In marketing and brand copy, fix only a false fact. Leave the claims, the tone, and the punctuation to the product owner.
- Keep a contrast when readers really hold the wrong belief, for example a shortcut that does not accept Shift alone.
- In a commit message or a PR, a removal is part of the change. Name it.
- When a reviewer needs it to judge a breaking change, state the unchanged behavior in the commit or the PR.
- Do not change quoted text, code, identifiers, commands, or messages from other programs.

## Refactor Progressively

- In each string, comment, or document that you change, fix the patterns of this skill.
- Do not edit other text only for this rule. List it as follow-up work.

## Review Checklist

- Does each sentence say something specific to its subject?
- Is each sentence for the reader, or a leftover from development?
- Does a sentence only reassure that something stayed the same?
- Does the text start with the subject and stop when the facts end?
- Is the text free of praise, comfort, staged honesty, cheer, and unchecked claims?
- Are there dashes between clauses, bold words in sentences, or decorative emoji?
- Does the Chinese text read as Chinese?
- Does a commit or a PR explain why, and report only the checks that ran?
