//! Small wrapper around sentencepiece's esaxx suffix array C++ library.
//! Usage
//!
//! ```rust
//! #[cfg(feature="cpp")]
//! {
//! let string = "abracadabra";
//! let suffix = esaxx_rs::suffix(string).unwrap();
//! let chars: Vec<_> = string.chars().collect();
//! let mut iter = suffix.iter();
//! assert_eq!(iter.next().unwrap(), (&chars[..4], 2)); // abra
//! assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
//! assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
//! assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
//! assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
//! assert_eq!(iter.next(), None);
//! }
//! ```
//!
//! The previous version uses unsafe optimized c++ code.
//! There exists another implementation a bit slower (~2x slower) that uses
//! safe rust. It's a bit slower because it uses usize (mostly 64bit) instead of i32 (32bit).
//! But it does seems to fix a few OOB issues in the cpp version
//! (which never seemed to cause real problems in tests but still.)
//!
//! ```rust
//! let string = "abracadabra";
//! let suffix = esaxx_rs::suffix_rs(string).unwrap();
//! let chars: Vec<_> = string.chars().collect();
//! let mut iter = suffix.iter();
//! assert_eq!(iter.next().unwrap(), (&chars[..4], 2)); // abra
//! assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
//! assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
//! assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
//! assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
//! assert_eq!(iter.next(), None);
//! ```

use std::convert::TryInto;
mod esa;
mod sais;
mod types;

use esa::esaxx_rs;
use types::SuffixError;

#[cfg(feature = "cc")]
extern "C" {
    fn esaxx_int32(
        // This is char32
        T: *const u32,
        SA: *mut i32,
        L: *mut i32,
        R: *mut i32,
        D: *mut i32,
        n: u32,
        k: u32,
        nodeNum: &mut u32,
    ) -> i32;
}

#[cfg(feature = "cc")]
fn esaxx(
    chars: &[char],
    sa: &mut [i32],
    l: &mut [i32],
    r: &mut [i32],
    d: &mut [i32],
    alphabet_size: u32,
    node_num: &mut u32,
) -> Result<(), SuffixError> {
    let n = chars.len();
    if sa.len() != n || l.len() != n || r.len() != n || d.len() != n {
        return Err(SuffixError::InvalidLength);
    }
    unsafe {
        let err = esaxx_int32(
            chars.as_ptr() as *const u32,
            sa.as_mut_ptr(),
            l.as_mut_ptr(),
            r.as_mut_ptr(),
            d.as_mut_ptr(),
            n.try_into().unwrap(),
            alphabet_size,
            node_num,
        );
        if err != 0 {
            return Err(SuffixError::Internal);
        }
    }
    Ok(())
}

pub struct SuffixIterator<'a, T> {
    i: usize,
    suffix: &'a Suffix<T>,
}

pub struct Suffix<T> {
    chars: Vec<char>,
    sa: Vec<T>,
    l: Vec<T>,
    r: Vec<T>,
    d: Vec<T>,
    node_num: usize,
}

/// Creates the suffix array and provides an iterator over its items (Rust version)
/// See [suffix](fn.suffix.html)
///
/// Gives you an iterator over the suffixes of the input array and their count within
/// the input string.
/// ```rust
/// let string = "abracadabra";
/// let suffix = esaxx_rs::suffix_rs(string).unwrap();
/// let chars: Vec<_> = string.chars().collect();
/// let mut iter = suffix.iter();
/// assert_eq!(iter.next().unwrap(), (&chars[..4], 2)); // abra
/// assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
/// assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
/// assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
/// assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
/// assert_eq!(iter.next(), None);
/// ```
pub fn suffix_rs(string: &str) -> Result<Suffix<usize>, SuffixError> {
    let chars: Vec<_> = string.chars().collect();
    let n = chars.len();
    let mut sa = vec![0; n];
    let mut l = vec![0; n];
    let mut r = vec![0; n];
    let mut d = vec![0; n];
    let alphabet_size = 0x110000; // All UCS4 range.
    let node_num = esaxx_rs(
        &chars.iter().map(|c| *c as u32).collect::<Vec<_>>(),
        &mut sa,
        &mut l,
        &mut r,
        &mut d,
        alphabet_size,
    )?;
    Ok(Suffix {
        chars,
        sa,
        l,
        r,
        d,
        node_num,
    })
}

/// Creates the suffix array and provides an iterator over its items (c++ unsafe version)
///
/// Gives you an iterator over the suffixes of the input array and their count within
/// the input string.
/// ```rust
/// let string = "abracadabra";
/// let suffix = esaxx_rs::suffix(string).unwrap();
/// let chars: Vec<_> = string.chars().collect();
/// let mut iter = suffix.iter();
/// assert_eq!(iter.next().unwrap(), (&chars[..4], 2)); // abra
/// assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
/// assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
/// assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
/// assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
/// assert_eq!(iter.next(), None);
/// ```
#[cfg(feature = "cpp")]
pub fn suffix(string: &str) -> Result<Suffix<i32>, SuffixError> {
    let chars: Vec<_> = string.chars().collect();
    let n = chars.len();
    let mut sa = vec![0; n];
    let mut l = vec![0; n];
    let mut r = vec![0; n];
    let mut d = vec![0; n];
    let mut node_num = 0;
    let alphabet_size = 0x110000; // All UCS4 range.
    esaxx(
        &chars,
        &mut sa,
        &mut l,
        &mut r,
        &mut d,
        alphabet_size,
        &mut node_num,
    )?;
    Ok(Suffix {
        chars,
        sa,
        l,
        r,
        d,
        node_num: node_num.try_into()?,
    })
}

impl<T> Suffix<T> {
    pub fn iter(&self) -> SuffixIterator<'_, T> {
        SuffixIterator { i: 0, suffix: self }
    }
}

impl<'a> Iterator for SuffixIterator<'a, i32> {
    type Item = (&'a [char], u32);

    fn next(&mut self) -> Option<Self::Item> {
        let index = self.i;
        if index == self.suffix.node_num {
            None
        } else {
            let left: usize = self.suffix.l[index].try_into().ok()?;
            let offset: usize = self.suffix.sa[left].try_into().ok()?;
            let len: usize = self.suffix.d[index].try_into().ok()?;
            let freq: u32 = (self.suffix.r[index] - self.suffix.l[index])
                .try_into()
                .ok()?;
            self.i += 1;
            Some((&self.suffix.chars[offset..offset + len], freq))
        }
    }
}

impl<'a> Iterator for SuffixIterator<'a, usize> {
    type Item = (&'a [char], u32);

    fn next(&mut self) -> Option<Self::Item> {
        let index = self.i;
        if index == self.suffix.node_num {
            None
        } else {
            let left: usize = self.suffix.l[index];
            let offset: usize = self.suffix.sa[left];
            let len: usize = self.suffix.d[index];
            let freq: u32 = (self.suffix.r[index] - self.suffix.l[index])
                .try_into()
                .unwrap();
            self.i += 1;
            Some((&self.suffix.chars[offset..offset + len], freq))
        }
    }
}

#[cfg(test)]
#[cfg(feature = "cpp")]
mod cpp_tests {
    use super::*;

    #[test]
    fn test_esaxx() {
        let string = "abracadabra".to_string();
        let chars: Vec<_> = string.chars().collect();
        let n = chars.len();
        let mut sa = vec![0; n];
        let mut l = vec![0; n];
        let mut r = vec![0; n];
        let mut d = vec![0; n];
        let mut node_num = 0;
        let alphabet_size = 0x110000; // All UCS4 range.

        esaxx(
            &chars,
            &mut sa,
            &mut l,
            &mut r,
            &mut d,
            alphabet_size,
            &mut node_num,
        )
        .unwrap();
        assert_eq!(node_num, 5);
        assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        assert_eq!(l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        assert_eq!(r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        assert_eq!(d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_esaxx_long() {
        let string = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.".to_string();
        let chars: Vec<_> = string.chars().collect();
        let n = chars.len();
        let mut sa = vec![0; n];
        let mut l = vec![0; n];
        let mut r = vec![0; n];
        let mut d = vec![0; n];
        let mut node_num = 0;
        let alphabet_size = 0x110000; // All UCS4 range.

        esaxx(
            &chars,
            &mut sa,
            &mut l,
            &mut r,
            &mut d,
            alphabet_size,
            &mut node_num,
        )
        .unwrap();
        assert_eq!(chars.len(), 574);
        assert_eq!(node_num, 260);
        // assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        // assert_eq!(l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        // assert_eq!(r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        // assert_eq!(d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_suffix() {
        let suffix = suffix("abracadabra").unwrap();
        assert_eq!(suffix.node_num, 5);
        assert_eq!(suffix.sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        assert_eq!(suffix.l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        assert_eq!(suffix.r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        assert_eq!(suffix.d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);

        let mut iter = suffix.iter();
        let chars: Vec<_> = "abracadabra".chars().collect();
        assert_eq!(iter.next(), Some((&chars[..4], 2))); // abra
        assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
        assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
        assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
        assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
        assert_eq!(iter.next(), None);
    }
}

#[cfg(test)]
mod rs_tests {
    use super::*;

    #[test]
    fn test_esaxx_rs() {
        let string = "abracadabra".to_string();
        let chars: Vec<_> = string.chars().map(|c| c as u32).collect();
        let n = chars.len();
        let mut sa = vec![0; n];
        let mut l = vec![0; n];
        let mut r = vec![0; n];
        let mut d = vec![0; n];
        let alphabet_size = 0x110000; // All UCS4 range.

        let node_num = esaxx_rs(&chars, &mut sa, &mut l, &mut r, &mut d, alphabet_size).unwrap();
        println!("Node num {}", node_num);
        println!("sa {:?}", sa);
        println!("l {:?}", l);
        println!("r {:?}", r);
        println!("d {:?}", d);
        assert_eq!(node_num, 5);
        assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        assert_eq!(l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        assert_eq!(r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        assert_eq!(d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_esaxx_rs_long() {
        let string = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.".to_string();
        let chars: Vec<_> = string.chars().map(|c| c as u32).collect();
        let n = chars.len();
        let mut sa = vec![0; n];
        let mut l = vec![0; n];
        let mut r = vec![0; n];
        let mut d = vec![0; n];
        let alphabet_size = 0x110000; // All UCS4 range.

        let node_num = esaxx_rs(&chars, &mut sa, &mut l, &mut r, &mut d, alphabet_size).unwrap();
        assert_eq!(chars.len(), 574);
        assert_eq!(node_num, 260);
        // assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        // assert_eq!(l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        // assert_eq!(r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        // assert_eq!(d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn test_suffix_rs() {
        let suffix = suffix_rs("abracadabra").unwrap();
        assert_eq!(suffix.node_num, 5);
        assert_eq!(suffix.sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
        assert_eq!(suffix.l, vec![1, 0, 5, 9, 0, 0, 3, 0, 0, 0, 2]);
        assert_eq!(suffix.r, vec![3, 5, 7, 11, 11, 1, 0, 1, 0, 0, 0]);
        assert_eq!(suffix.d, vec![4, 1, 3, 2, 0, 0, 0, 0, 0, 0, 0]);

        let mut iter = suffix.iter();
        let chars: Vec<_> = "abracadabra".chars().collect();
        assert_eq!(iter.next(), Some((&chars[..4], 2))); // abra
        assert_eq!(iter.next(), Some((&chars[..1], 5))); // a
        assert_eq!(iter.next(), Some((&chars[1..4], 2))); // bra
        assert_eq!(iter.next(), Some((&chars[2..4], 2))); // ra
        assert_eq!(iter.next(), Some((&chars[..0], 11))); // ''
        assert_eq!(iter.next(), None);
    }

    #[test]
    fn test_out_of_bounds_bug() {
        let string = "banana$band$$";
        suffix_rs(string).unwrap();
    }
}
