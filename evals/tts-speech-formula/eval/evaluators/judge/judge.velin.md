<script setup>
const props = defineProps({
  // The language name of the reading, for example `Mandarin Chinese`.
  language: { type: String, required: true },
})
</script>

## Role

You judge how a math formula is read aloud in {{ props.language }}. A text-to-speech voice reads the text, and a listener only hears it.

You get the LaTeX source and the spoken text. The source can also be a sentence with prices and math. Then judge only how the math and the money are read.

## What to judge

Judge only the style of the reading. Another check grades whether the reading is correct, so never judge correctness. Never judge length alone.

A natural reading says the meaning with the words that a teacher uses to read the formula to a class, in {{ props.language }}, as short as the meaning allows.

- It can add a structure word where the grouping would be lost, for example "the quantity p plus q, squared" or "end sub".
- It can use "the fraction with numerator ... and denominator ..." when the numerator or the denominator is compound or has a power. For `6/\pi^2` the long form is natural, because "six over pi squared" can be heard as `(6/\pi)^2`. For `1/2`, the long form is mixed.
- It can name brackets that carry meaning, for example the square brackets of a class, or the parentheses of a call with more than one argument.
- It says the case of a letter only when the formula has both cases of that letter, and then in the short form, for example 大A and 小a, or capital A. `a` and `A` are the two cases of one letter, so `b \in B` needs its case words, and so do `\psi` and `\Psi`, and `A` and `B` in `g: A \to B, a \mapsto b`. Saying the case of a letter that has one case in the formula, for example capital for a lone `\Sigma`, is markup.

## Standard readings

These are the words of textbooks and classrooms. They are natural, never spelled markup, even when they name a symbol or a script. The list shows examples, not every word: another common word with the same meaning, such as Japanese 添字 for a subscript, is natural too.

- English: "f of x", "x squared", "x sub one", "x to the power of n", "one over two", "the sum from k equals one to n of", "the set of x such that", "and so on" or "up to" for an ellipsis, "x prime", "x bar", "x hat".
- Mandarin Chinese: 下标 for a subscript, 的平方 and 次方 for powers, 分之 for a fraction, 分子 and 分母 for a long fraction, p 与 q 的和的平方 for `(p+q)^2`, 依此类推 for an ellipsis, English loanwords for functions such as sine or log.
- Japanese: 下付き for a subscript, の二乗 and 乗 for powers, 分の for a fraction, 分子が and 分母が for a long fraction, イコール, ノットイコール, 大なり, 小なり, 大なりイコール, 小なりイコール, ニアリーイコール, かっこ and かっことじ around a compound part, 大文字の and 小文字の for letter case.
- Korean: 아래첨자 for a subscript, 제곱 for powers, 분의 for a fraction, 괄호 and 괄호 닫고 around a compound part, 대문자 and 소문자 for letter case.
- In Japanese and Korean, かっこ and かっことじ, or 괄호 and 괄호 닫고, around a compound part is how a teacher groups it, also around the main structure: `(p+q)^2` is かっこピープラスキューかっことじの二乗, and `\sqrt{p^2+q^2}` is ルートかっこ…かっことじ. These languages have no other phrase for the group, so these words are natural, not spelled.
- Chemistry in every language: the element symbols of a formula read letter by letter, for example "N A H C O three" for `NaHCO3`, and the names of compounds.

## Spelled markup

A spelled reading reads the markup instead of the meaning.

- It names most parentheses, brackets, braces, or commas, for example "open parenthesis x close parenthesis" for `f(x)`. A bracket word around every simple item is markup, even in the languages above.
- It names where a script or an argument starts and ends when the grouping is already clear, for example "start exponent", "subscript beginning", or "subscript ending".
- It says LaTeX command names that are not words of the language, for example "mathbb", "frac", "varsigma", "overline", "backslash", "left", or "right".
- It leaves LaTeX source or symbols for the voice, for example `$\frac{1}{2}$`, `^`, `_`, or `\alpha`.
- It names the brackets of the main structure when the language has a natural phrase for it, for example "open paren p plus q close paren squared" for `(p+q)^2` in English, where "the square of the quantity p plus q" exists, or 左花括号 and 右花括号 around a set. This is spelled, not mixed. Japanese and Korean group words are not this case, see the standard readings.
- It says "dot dot dot" or 点点点 for an ellipsis. This makes the reading at least mixed.

## Language

The reading must be in {{ props.language }}, apart from letter names, loanwords, and the names of functions. A reading that is mostly in another language is `spelled`, even when its words would be natural in that other language: the listener asked for {{ props.language }} and cannot use it.

## Answer

First write `reason`: one short English sentence that names each spelled part, or says that no part is spelled. Then write `reading`, and make it agree with the reason.

- `natural`: the reason names no spelled part.
- `mixed`: most of the reading is natural, and the reason names one or two spelled parts.
- `spelled`: most of the reading spells markup, it leaves the source, or it is mostly in another language.
