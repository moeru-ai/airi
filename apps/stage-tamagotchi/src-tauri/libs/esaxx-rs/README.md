![](https://github.com/Narsil/esaxx-rs/workflows/build/badge.svg)

# esaxx-rs

This code implements a fast suffix tree / suffix array.

This code is taken from ![sentencepiece](https://github.com/google/sentencepiece) 
and to be used by ![hugging face](https://github.com/huggingface/tokenizers/).


Small wrapper around sentencepiece's esaxx suffix array C++ library.
Usage

```rust
let string = "abracadabra";
let suffix = esaxx_rs::suffix(string).unwrap();
let chars: Vec<_> = string.chars().collect();
let mut iter = suffix.iter();
assert_eq!(iter.next().unwrap(), (&chars[..4], 2)); // abra
assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
assert_eq!(iter.next(), None);
```
