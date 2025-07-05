use crate::types::{Bucket, SArray, StringT, SuffixError};

fn has_high_bit(j: usize) -> bool {
    (0x0001usize & j.reverse_bits()) == 1
}

fn get_counts(t: &StringT, c: &mut Bucket) {
    c.fill(0);
    t.iter().for_each(|character| c[*character as usize] += 1);
}
fn get_buckets(c: &Bucket, b: &mut Bucket, end: bool) {
    let mut sum = 0;
    if end {
        c.iter().zip(b.iter_mut()).for_each(|(&c_el, b_el)| {
            sum += c_el;
            *b_el = sum;
        });
    } else {
        c.iter().zip(b.iter_mut()).for_each(|(&c_el, b_el)| {
            *b_el = sum;
            sum += c_el;
        });
    }
}

fn induce_sa(
    string: &StringT,
    suffix_array: &mut SArray,
    counts: &mut Bucket,
    buckets: &mut Bucket,
    n: usize,
) {
    debug_assert!(n <= suffix_array.len());
    get_counts(string, counts);
    get_buckets(counts, buckets, false);

    let mut c0;
    let mut j = n - 1;
    let mut c1 = string[j] as usize;
    let mut index = buckets[c1];
    suffix_array[index] = if j > 0 && (string[j - 1] as usize) < c1 {
        !j
    } else {
        j
    };
    index += 1;
    for i in 0..n {
        j = suffix_array[i];
        suffix_array[i] = !j;
        if !has_high_bit(j) && j > 0 {
            j -= 1;
            c0 = string[j] as usize;
            if c0 != c1 {
                buckets[c1] = index;
                c1 = c0;
                index = buckets[c1];
            }
            suffix_array[index] = if j > 0 && !has_high_bit(j) && (string[j - 1] as usize) < c1 {
                !j
            } else {
                j
            };
            index += 1;
        }
    }

    // Compute SA
    // XXX: true here.
    get_counts(string, counts);
    get_buckets(counts, buckets, true);
    c1 = 0;
    index = buckets[c1];
    for i in (0..n).rev() {
        j = suffix_array[i];
        if j > 0 && !has_high_bit(j) {
            j -= 1;
            c0 = string[j] as usize;
            if c0 != c1 {
                buckets[c1] = index;
                c1 = c0;
                index = buckets[c1];
            }
            index -= 1;
            suffix_array[index] = if j == 0 || (string[j - 1] as usize) > c1 {
                !j
            } else {
                j
            };
        } else {
            suffix_array[i] = !j;
        }
    }
}

fn compute_bwt(
    string: &StringT,
    suffix_array: &mut SArray,
    counts: &mut Bucket,
    buckets: &mut Bucket,
    n: usize,
) -> usize {
    // TODO
    let mut pidx = 0;
    get_counts(string, counts);
    get_buckets(counts, buckets, false);
    let mut j = n - 1;
    let mut c1 = string[j] as usize;
    let mut c0;
    let mut index = buckets[c1];
    // bb = SA + B[c1 = T[j = n - 1]];
    // *bb++ = ((0 < j) && (T[j - 1] < c1)) ? ~j : j;
    suffix_array[index] = if j > 0 && (string[j - 1] as usize) < c1 {
        !j
    } else {
        j
    };
    index += 1;
    for i in 0..n {
        j = suffix_array[i];
        if j > 0 {
            j -= 1;
            c0 = string[j] as usize;
            suffix_array[i] = !c0;
            if c0 != c1 {
                buckets[c1] = index;
                c1 = c0;
                index = buckets[c1];
            }
            suffix_array[index] = if j > 0 && (string[j - 1] as usize) < c1 {
                !j
            } else {
                j
            };
            index += 1;
        } else if j != 0 {
            suffix_array[i] = !j;
        }
    }

    // Compute SA
    get_counts(string, counts);
    get_buckets(counts, buckets, true);
    c1 = 0;
    index = buckets[c1];
    for i in (0..n).rev() {
        j = suffix_array[i];
        if j > 0 {
            j -= 1;
            c0 = string[j] as usize;
            suffix_array[i] = c0;
            if c0 != c1 {
                buckets[c1] = index;
                c1 = c0;
                index = buckets[c1];
            }
            index -= 1;
            suffix_array[index] = if j > 0 && (string[j - 1] as usize) > c1 {
                !(string[j - 1] as usize)
            } else {
                j
            };
        } else if j != 0 {
            suffix_array[i] = !j;
        } else {
            pidx = i
        }
    }
    pidx
}

#[allow(clippy::many_single_char_names)]
fn suffixsort(
    string: &StringT,
    suffix_array: &mut SArray,
    fs: usize,
    n: usize,
    k: usize,
    is_bwt: bool,
) -> Result<usize, SuffixError> {
    let mut pidx = 0;
    let mut c0;

    let mut counts = vec![0; k];
    let mut buckets = vec![0; k];
    get_counts(string, &mut counts);
    get_buckets(&counts, &mut buckets, true);
    // stage 1:
    // reduce the problem by at least 1/2
    // sort all the S-substrings
    suffix_array.fill(0);
    let mut c_index = 0;
    let mut c1 = string[n - 1] as usize;
    for i in (0..n - 1).rev() {
        c0 = string[i] as usize;
        if c0 < c1 + c_index {
            c_index = 1;
        } else if c_index != 0 {
            buckets[c1] -= 1;
            suffix_array[buckets[c1]] = i + 1;
            c_index = 0;
        }
        c1 = c0;
    }
    induce_sa(string, suffix_array, &mut counts, &mut buckets, n);

    // compact all the sorted substrings into the first m items of SA
    // 2*m must be not larger than n (proveable)

    // TODO: This was in the parallel loop.
    let mut p;
    let mut j;
    let mut m = 0;
    for i in 0..n {
        p = suffix_array[i];
        c0 = string[p] as usize;
        if p > 0 && (string[p - 1] as usize) > c0 {
            // TODO overly complex. But fricking hard to get right.
            j = p + 1;
            if j < n {
                c1 = string[j] as usize;
            }
            while j < n && c0 == c1 {
                c1 = string[j] as usize;
                j += 1;
            }
            if j < n && c0 < c1 {
                suffix_array[m] = p;
                m += 1;
            }
        }
    }
    j = m + (n >> 1);
    for item in suffix_array.iter_mut().take(j).skip(m) {
        *item = 0;
    }

    /* store the length of all substrings */
    j = n;
    let mut c_index = 0;
    c1 = string[n - 1] as usize;
    for i in (0..n - 1).rev() {
        c0 = string[i] as usize;
        if c0 < c1 + c_index {
            c_index = 1;
        } else if c_index != 0 {
            suffix_array[m + ((i + 1) >> 1)] = j - i - 1;
            j = i + 1;
            c_index = 0;
        }
        c1 = c0;
    }

    /* find the lexicographic names of all substrings */
    let mut name = 0;
    let mut q = n;
    let mut qlen = 0;
    let mut plen;
    let mut diff;
    for i in 0..m {
        p = suffix_array[i];
        plen = suffix_array[m + (p >> 1)];
        diff = true;
        if plen == qlen {
            j = 0;
            while j < plen && string[p + j] == string[q + j] {
                j += 1;
            }
            if j == plen {
                diff = false;
            }
        }
        if diff {
            name += 1;
            q = p;
            qlen = plen;
        }
        suffix_array[m + (p >> 1)] = name;
    }
    /* stage 2: solve the reduced problem
    recurse if names are not yet unique */
    if name < m {
        let ra_index = n + fs - m;
        j = m - 1;
        let a = m + (n >> 1);
        for i in (m..a).rev() {
            if suffix_array[i] != 0 {
                suffix_array[ra_index + j] = suffix_array[i] - 1;
                // XXX: Bug underflow caught by Rust yeah (well cpp used i32)
                j = j.saturating_sub(1);
            }
        }
        // XXX: Could call transmute on SA to avoid allocation.
        // but it requires unsafe.
        let ra: Vec<u32> = suffix_array
            .iter()
            .skip(ra_index)
            .take(m)
            .map(|n| *n as u32)
            .collect();
        suffixsort(&ra, suffix_array, fs + n - m * 2, m, name, false)?;
        // let ra: &[char] =
        //     unsafe { std::mem::transmute::<&[usize], &[char]>(&sa[ra_index..ra_index + m]) };
        // suffixsort(ra, sa, fs + n - m * 2, m, name, false)?;
        j = m - 1;
        c_index = 0;
        c1 = string[n - 1] as usize;
        for i in (0..n - 1).rev() {
            c0 = string[i] as usize;
            if c0 < c1 + c_index {
                c_index = 1;
            } else if c_index != 0 {
                suffix_array[ra_index + j] = i + 1;
                c_index = 0;
                j = j.saturating_sub(1);
            }
            c1 = c0;
        }
        // get index in s
        for i in 0..m {
            suffix_array[i] = suffix_array[ra_index + suffix_array[i]];
        }
    }

    /* stage 3: induce the result for the original problem */
    /* put all left-most S characters into their buckets */
    get_counts(string, &mut counts);
    get_buckets(&counts, &mut buckets, true);
    for item in suffix_array.iter_mut().take(n).skip(m) {
        *item = 0;
    }
    for i in (0..m).rev() {
        j = suffix_array[i];
        suffix_array[i] = 0;
        if buckets[string[j] as usize] > 0 {
            buckets[string[j] as usize] -= 1;
            suffix_array[buckets[string[j] as usize]] = j;
        }
    }
    if is_bwt {
        pidx = compute_bwt(string, suffix_array, &mut counts, &mut buckets, n);
    } else {
        induce_sa(string, suffix_array, &mut counts, &mut buckets, n);
    }

    Ok(pidx)
}

pub fn saisxx(
    string: &StringT,
    suffix_array: &mut SArray,
    n: usize,
    k: usize,
) -> Result<(), SuffixError> {
    if n == 1 {
        suffix_array[0] = 0;
        return Ok(());
    }
    let fs = 0;
    suffixsort(string, suffix_array, fs, n, k, false)?;
    Ok(())
}
fn _saisxx_bwt(
    t: &StringT,
    u: &mut StringT,
    sa: &mut SArray,
    n: usize,
    k: usize,
) -> Result<usize, SuffixError> {
    if n <= 1 {
        if n == 1 {
            u[0] = t[0];
        }
        return Ok(n);
    }
    let mut pidx = suffixsort(t, sa, 0, n, k, true)?;
    u[0] = t[n - 1];
    for i in 0..pidx {
        u[i + 1] = sa[i] as u32;
    }
    for i in pidx + 1..n {
        u[i] = sa[i] as u32
    }
    pidx += 1;
    Ok(pidx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_induce_sa() {
        let chars: Vec<_> = "abracadabra".chars().map(|c| c as u32).collect();
        let mut c = vec![0; 256];
        let mut b = vec![0; 256];

        let mut sa = vec![0, 0, 3, 5, 7, 0, 0, 0, 0, 0, 0];
        induce_sa(&chars, &mut sa, &mut b, &mut c, chars.len());
        assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);

        let mut sa = vec![0, 0, 7, 3, 5, 0, 0, 0, 0, 0, 0];
        induce_sa(&chars, &mut sa, &mut b, &mut c, chars.len());
        assert_eq!(sa, vec![10, 7, 0, 3, 5, 8, 1, 4, 6, 9, 2]);
    }

    #[test]
    fn test_induce_sa_long() {
        let string = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.".to_string();
        let chars: Vec<_> = string.chars().map(|c| c as u32).collect();
        let mut c = vec![0; 256];
        let mut b = vec![0; 256];
        let mut sa = vec![
            5, 11, 14, 21, 27, 32, 35, 39, 48, 52, 64, 74, 80, 86, 90, 95, 99, 110, 119, 125, 130,
            135, 141, 145, 152, 157, 160, 168, 176, 181, 183, 190, 193, 198, 202, 212, 215, 218,
            223, 225, 230, 239, 245, 248, 252, 261, 265, 270, 275, 286, 290, 295, 299, 304, 309,
            320, 333, 343, 355, 366, 369, 373, 385, 388, 392, 398, 403, 407, 415, 418, 427, 434,
            445, 451, 457, 467, 471, 476, 485, 490, 498, 509, 518, 523, 529, 539, 549, 558, 561,
            567, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 148, 396, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 534, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 88, 113, 116, 185, 206, 220, 250, 302,
            337, 351, 360, 371, 379, 412, 423, 439, 459, 462, 515, 0, 0, 0, 208, 501, 0, 0, 0, 139,
            204, 234, 313, 358, 479, 542, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 67, 102, 526, 545, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 3, 29, 56, 58, 78, 127, 133, 155, 174, 188, 237, 283, 324, 326, 335,
            347, 409, 425, 430, 449, 464, 537, 551, 565, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 505, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 16, 42, 45, 61, 137, 171, 257, 329, 340, 381, 400, 442, 487, 503,
            520, 554, 0, 0, 0, 0, 0, 163, 494, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19, 268,
            483, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 122, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            437, 556, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375,
            496, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 71, 106, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 69, 104, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ];
        assert_eq!(sa.len(), chars.len());
        induce_sa(&chars, &mut sa, &mut b, &mut c, chars.len());
        assert_eq!(
            sa,
            vec![
                145, 392, 523, 5, 80, 451, 567, 245, 366, 418, 74, 445, 561, 529, 181, 223, 290,
                157, 48, 198, 467, 90, 239, 286, 275, 434, 490, 21, 119, 309, 343, 130, 270, 183,
                86, 248, 385, 539, 64, 99, 304, 11, 212, 299, 518, 218, 471, 261, 32, 190, 415,
                558, 265, 457, 373, 39, 168, 498, 476, 333, 407, 202, 427, 14, 135, 509, 230, 110,
                252, 27, 125, 35, 95, 141, 295, 388, 403, 215, 176, 193, 225, 52, 320, 355, 160,
                549, 369, 152, 398, 485, 108, 151, 285, 332, 466, 573, 73, 244, 365, 148, 396, 149,
                146, 393, 147, 395, 394, 524, 6, 81, 452, 568, 246, 367, 419, 0, 75, 446, 562, 534,
                530, 182, 224, 531, 462, 337, 439, 220, 535, 185, 351, 291, 206, 158, 49, 199, 468,
                113, 360, 302, 116, 515, 379, 88, 250, 371, 412, 423, 459, 91, 208, 501, 240, 287,
                319, 139, 479, 276, 358, 234, 542, 435, 204, 313, 51, 118, 201, 211, 260, 384, 470,
                364, 115, 491, 545, 22, 120, 526, 67, 102, 38, 98, 140, 144, 197, 222, 229, 274,
                298, 391, 406, 414, 475, 517, 522, 533, 301, 411, 233, 312, 478, 210, 259, 383,
                363, 92, 430, 409, 310, 3, 78, 449, 565, 335, 93, 155, 237, 347, 480, 277, 133,
                174, 537, 551, 283, 464, 56, 324, 492, 344, 425, 420, 431, 58, 326, 131, 29, 127,
                188, 34, 192, 417, 560, 271, 512, 47, 63, 342, 444, 508, 548, 331, 184, 532, 362,
                463, 402, 489, 87, 249, 359, 37, 97, 143, 297, 390, 405, 154, 429, 505, 350, 318,
                282, 520, 235, 16, 386, 137, 540, 65, 100, 45, 61, 340, 442, 506, 546, 329, 338,
                440, 171, 42, 305, 554, 12, 381, 503, 213, 400, 487, 272, 257, 180, 243, 221, 521,
                536, 163, 494, 378, 525, 300, 410, 311, 209, 187, 502, 519, 186, 352, 292, 543, 19,
                268, 353, 483, 4, 10, 79, 85, 450, 456, 566, 572, 219, 336, 207, 236, 24, 122, 472,
                17, 25, 123, 94, 156, 159, 167, 238, 387, 138, 357, 541, 50, 200, 469, 114, 66,
                101, 46, 62, 341, 443, 507, 547, 330, 361, 317, 339, 441, 162, 267, 262, 164, 556,
                437, 172, 348, 43, 481, 306, 278, 217, 294, 308, 33, 191, 416, 559, 511, 179, 242,
                316, 266, 436, 555, 178, 241, 496, 375, 473, 1, 76, 447, 563, 263, 165, 303, 497,
                458, 196, 228, 232, 55, 323, 18, 374, 40, 169, 7, 82, 453, 569, 499, 376, 134, 175,
                538, 205, 422, 117, 474, 516, 477, 2, 77, 334, 408, 448, 564, 281, 41, 170, 380,
                315, 552, 255, 106, 71, 13, 89, 109, 251, 372, 397, 433, 528, 557, 150, 284, 465,
                461, 203, 413, 382, 57, 325, 346, 424, 428, 504, 15, 136, 553, 493, 293, 510, 231,
                460, 345, 111, 69, 104, 8, 83, 454, 570, 253, 31, 129, 214, 247, 264, 289, 368,
                426, 112, 438, 28, 126, 173, 401, 488, 36, 96, 142, 296, 389, 404, 349, 44, 60,
                328, 482, 216, 307, 177, 495, 421, 314, 70, 105, 432, 59, 327, 279, 513, 194, 226,
                53, 321, 500, 544, 377, 9, 84, 455, 571, 23, 121, 356, 161, 280, 254, 527, 68, 103,
                288, 273, 258, 132, 550, 256, 370, 514, 153, 399, 486, 166, 30, 128, 20, 26, 124,
                189, 269, 354, 484, 107, 72, 195, 227, 54, 322
            ]
        );
    }
}
