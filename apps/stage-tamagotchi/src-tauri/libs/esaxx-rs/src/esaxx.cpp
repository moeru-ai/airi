// 
// /*
//  * sais.hxx for sais-lite
//  * Copyright (c) 2008-2009 Yuta Mori All Rights Reserved.
//  *
//  * Permission is hereby granted, free of charge, to any person
//  * obtaining a copy of this software and associated documentation
//  * files (the "Software"), to deal in the Software without
//  * restriction, including without limitation the rights to use,
//  * copy, modify, merge, publish, distribute, sublicense, and/or sell
//  * copies of the Software, and to permit persons to whom the
//  * Software is furnished to do so, subject to the following
//  * conditions:
//  *
//  * The above copyright notice and this permission notice shall be
//  * included in all copies or substantial portions of the Software.
//  *
//  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//  * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
//  * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//  * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//  * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
//  * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
//  * OTHER DEALINGS IN THE SOFTWARE.
//  */
// 
// #ifndef _SAIS_HXX
// #define _SAIS_HXX 1
// #ifdef __cplusplus
// 
// #ifdef __INTEL_COMPILER
// #pragma warning(disable : 383 981 1418)
// // for icc 64-bit
// //#define __builtin_vsnprintf(a, b, c, d) __builtin_vsnprintf(a, b, c, (char *)d)
// #endif
// 
// #include <iterator>
// #ifdef _OPENMP
// # include <omp.h>
// #endif
// 
// namespace saisxx_private {
// 
// /* find the start or end of each bucket */
// template<typename string_type, typename bucket_type, typename index_type>
// void
// getCounts(const string_type T, bucket_type C, index_type n, index_type k) {
// #ifdef _OPENMP
//   bucket_type D;
//   index_type i, j, p, sum, first, last;
//   int thnum, maxthreads = omp_get_max_threads();
// #pragma omp parallel default(shared) private(D, i, thnum, first, last)
//   {
//     thnum = omp_get_thread_num();
//     D = C + thnum * k;
//     first = n / maxthreads * thnum;
//     last = (thnum < (maxthreads - 1)) ? n / maxthreads * (thnum + 1) : n;
//     for(i = 0; i < k; ++i) { D[i] = 0; }
//     for(i = first; i < last; ++i) { ++D[T[i]]; }
//   }
//   if(1 < maxthreads) {
// #pragma omp parallel for default(shared) private(i, j, p, sum)
//     for(i = 0; i < k; ++i) {
//       for(j = 1, p = i + k, sum = C[i]; j < maxthreads; ++j, p += k) {
//         sum += C[p];
//       }
//       C[i] = sum;
//     }
//   }
// #else
//   index_type i;
//   for(i = 0; i < k; ++i) { C[i] = 0; }
//   for(i = 0; i < n; ++i) { ++C[T[i]]; }
// #endif
// }
// template<typename bucket_type, typename index_type>
// void
// getBuckets(const bucket_type C, bucket_type B, index_type k, bool end) {
//   index_type i, sum = 0;
//   if(end) { for(i = 0; i < k; ++i) { sum += C[i]; B[i] = sum; } }
//   else { for(i = 0; i < k; ++i) { sum += C[i]; B[i] = sum - C[i]; } }
// }
// 
// /* compute SA and BWT */
// template<typename string_type, typename sarray_type,
//          typename bucket_type, typename index_type>
// void
// induceSA(string_type T, sarray_type SA, bucket_type C, bucket_type B,
//          index_type n, index_type k) {
// typedef typename std::iterator_traits<string_type>::value_type char_type;
//   sarray_type b;
//   index_type i, j;
//   char_type c0, c1;
//   /* compute SAl */
//   if(C == B) { getCounts(T, C, n, k); }
//   getBuckets(C, B, k, false); /* find starts of buckets */
//   b = SA + B[c1 = T[j = n - 1]];
//   *b++ = ((0 < j) && (T[j - 1] < c1)) ? ~j : j;
//   for(i = 0; i < n; ++i) {
//     j = SA[i], SA[i] = ~j;
//     if(0 < j) {
//       if((c0 = T[--j]) != c1) { B[c1] = b - SA; b = SA + B[c1 = c0]; }
//       *b++ = ((0 < j) && (T[j - 1] < c1)) ? ~j : j;
//     }
//   }
//   /* compute SAs */
//   if(C == B) { getCounts(T, C, n, k); }
//   getBuckets(C, B, k, true); /* find ends of buckets */
//   for(i = n - 1, b = SA + B[c1 = 0]; 0 <= i; --i) {
//     if(0 < (j = SA[i])) {
//       if((c0 = T[--j]) != c1) { B[c1] = b - SA; b = SA + B[c1 = c0]; }
//       *--b = ((j == 0) || (T[j - 1] > c1)) ? ~j : j;
//     } else {
//       SA[i] = ~j;
//     }
//   }
// }
// template<typename string_type, typename sarray_type,
//          typename bucket_type, typename index_type>
// int
// computeBWT(string_type T, sarray_type SA, bucket_type C, bucket_type B,
//            index_type n, index_type k) {
// typedef typename std::iterator_traits<string_type>::value_type char_type;
//   sarray_type b;
//   index_type i, j, pidx = -1;
//   char_type c0, c1;
//   /* compute SAl */
//   if(C == B) { getCounts(T, C, n, k); }
//   getBuckets(C, B, k, false); /* find starts of buckets */
//   b = SA + B[c1 = T[j = n - 1]];
//   *b++ = ((0 < j) && (T[j - 1] < c1)) ? ~j : j;
//   for(i = 0; i < n; ++i) {
//     if(0 < (j = SA[i])) {
//       SA[i] = ~(c0 = T[--j]);
//       if(c0 != c1) { B[c1] = b - SA; b = SA + B[c1 = c0]; }
//       *b++ = ((0 < j) && (T[j - 1] < c1)) ? ~j : j;
//     } else if(j != 0) {
//       SA[i] = ~j;
//     }
//   }
//   /* compute SAs */
//   if(C == B) { getCounts(T, C, n, k); }
//   getBuckets(C, B, k, true); /* find ends of buckets */
//   for(i = n - 1, b = SA + B[c1 = 0]; 0 <= i; --i) {
//     if(0 < (j = SA[i])) {
//       SA[i] = (c0 = T[--j]);
//       if(c0 != c1) { B[c1] = b - SA; b = SA + B[c1 = c0]; }
//       *--b = ((0 < j) && (T[j - 1] > c1)) ? ~((index_type)T[j - 1]) : j;
//     } else if(j != 0) {
//       SA[i] = ~j;
//     } else {
//       pidx = i;
//     }
//   }
//   return pidx;
// }
// 
// /* find the suffix array SA of T[0..n-1] in {0..k}^n
//    use a working space (excluding s and SA) of at most 2n+O(1) for a constant alphabet */
// template<typename string_type, typename sarray_type, typename index_type>
// int
// suffixsort(string_type T, sarray_type SA,
//            index_type fs, index_type n, index_type k,
//            bool isbwt) {
// typedef typename std::iterator_traits<string_type>::value_type char_type;
//   sarray_type RA;
//   index_type i, j, m, p, q, plen, qlen, name, pidx = 0;
//   bool diff;
//   int c;
// #ifdef _OPENMP
//   int maxthreads = omp_get_max_threads();
// #else
// # define maxthreads 1
// #endif
//   char_type c0, c1;
// 
//   /* stage 1: reduce the problem by at least 1/2
//      sort all the S-substrings */
//   if(fs < (maxthreads * k)) {
//     index_type *C, *B;
//     if((C = new index_type[maxthreads * k]) == 0) { return -2; }
//     B = (1 < maxthreads) ? C + k : C;
//     getCounts(T, C, n, k); getBuckets(C, B, k, true); /* find ends of buckets */
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//     for(i = 0; i < n; ++i) { SA[i] = 0; }
//     for(i = n - 2, c = 0, c1 = T[n - 1]; 0 <= i; --i, c1 = c0) {
//       if((c0 = T[i]) < (c1 + c)) { c = 1; }
//       else if(c != 0) { SA[--B[c1]] = i + 1, c = 0; }
//     }
//     induceSA(T, SA, C, B, n, k);
//     delete [] C;
//   } else {
//     sarray_type C, B;
//     C = SA + n;
//     B = ((1 < maxthreads) || (k <= (fs - k))) ? C + k : C;
//     getCounts(T, C, n, k); getBuckets(C, B, k, true); /* find ends of buckets */
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//     for(i = 0; i < n; ++i) { SA[i] = 0; }
//     for(i = n - 2, c = 0, c1 = T[n - 1]; 0 <= i; --i, c1 = c0) {
//       if((c0 = T[i]) < (c1 + c)) { c = 1; }
//       else if(c != 0) { SA[--B[c1]] = i + 1, c = 0; }
//     }
//     induceSA(T, SA, C, B, n, k);
//   }
// 
//   /* compact all the sorted substrings into the first m items of SA
//      2*m must be not larger than n (proveable) */
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i, j, p, c0, c1)
//   for(i = 0; i < n; ++i) {
//     p = SA[i];
//     if((0 < p) && (T[p - 1] > (c0 = T[p]))) {
//       for(j = p + 1; (j < n) && (c0 == (c1 = T[j])); ++j) { }
//       if((j < n) && (c0 < c1)) { SA[i] = ~p; }
//     }
//   }
//   for(i = 0, m = 0; i < n; ++i) { if((p = SA[i]) < 0) { SA[m++] = ~p; } }
// #else
//   for(i = 0, m = 0; i < n; ++i) {
//     p = SA[i];
//     if((0 < p) && (T[p - 1] > (c0 = T[p]))) {
//       for(j = p + 1; (j < n) && (c0 == (c1 = T[j])); ++j) { }
//       if((j < n) && (c0 < c1)) { SA[m++] = p; }
//     }
//   }
// #endif
//   j = m + (n >> 1);
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//   for(i = m; i < j; ++i) { SA[i] = 0; } /* init the name array buffer */
//   /* store the length of all substrings */
//   for(i = n - 2, j = n, c = 0, c1 = T[n - 1]; 0 <= i; --i, c1 = c0) {
//     if((c0 = T[i]) < (c1 + c)) { c = 1; }
//     else if(c != 0) { SA[m + ((i + 1) >> 1)] = j - i - 1; j = i + 1; c = 0; }
//   }
//   /* find the lexicographic names of all substrings */
//   for(i = 0, name = 0, q = n, qlen = 0; i < m; ++i) {
//     p = SA[i], plen = SA[m + (p >> 1)], diff = true;
//     if(plen == qlen) {
//       for(j = 0; (j < plen) && (T[p + j] == T[q + j]); ++j) { }
//       if(j == plen) { diff = false; }
//     }
//     if(diff != false) { ++name, q = p, qlen = plen; }
//     SA[m + (p >> 1)] = name;
//   }
// 
//   /* stage 2: solve the reduced problem
//      recurse if names are not yet unique */
//   if(name < m) {
//     RA = SA + n + fs - m;
//     for(i = m + (n >> 1) - 1, j = m - 1; m <= i; --i) {
//       if(SA[i] != 0) { RA[j--] = SA[i] - 1; }
//     }
//     if(suffixsort(RA, SA, fs + n - m * 2, m, name, false) != 0) { return -2; }
//     for(i = n - 2, j = m - 1, c = 0, c1 = T[n - 1]; 0 <= i; --i, c1 = c0) {
//       if((c0 = T[i]) < (c1 + c)) { c = 1; }
//       else if(c != 0) { RA[j--] = i + 1, c = 0; } /* get p1 */
//     }
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//     for(i = 0; i < m; ++i) { SA[i] = RA[SA[i]]; } /* get index in s */
//   }
// 
//   /* stage 3: induce the result for the original problem */
//   if(fs < (maxthreads * k)) {
//     index_type *B, *C;
//     if((C = new index_type[maxthreads * k]) == 0) { return -2; }
//     B = (1 < maxthreads) ? C + k : C;
//     /* put all left-most S characters into their buckets */
//     getCounts(T, C, n, k); getBuckets(C, B, k, true); /* find ends of buckets */
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//     for(i = m; i < n; ++i) { SA[i] = 0; } /* init SA[m..n-1] */
//     for(i = m - 1; 0 <= i; --i) {
//       j = SA[i], SA[i] = 0;
//       SA[--B[T[j]]] = j;
//     }
//     if(isbwt == false) { induceSA(T, SA, C, B, n, k); }
//     else { pidx = computeBWT(T, SA, C, B, n, k); }
//     delete [] C;
//   } else {
//     sarray_type C, B;
//     C = SA + n;
//     B = ((1 < maxthreads) || (k <= (fs - k))) ? C + k : C;
//     /* put all left-most S characters into their buckets */
//     getCounts(T, C, n, k); getBuckets(C, B, k, true); /* find ends of buckets */
// #ifdef _OPENMP
// #pragma omp parallel for default(shared) private(i)
// #endif
//     for(i = m; i < n; ++i) { SA[i] = 0; } /* init SA[m..n-1] */
//     for(i = m - 1; 0 <= i; --i) {
//       j = SA[i], SA[i] = 0;
//       SA[--B[T[j]]] = j;
//     }
//     if(isbwt == false) { induceSA(T, SA, C, B, n, k); }
//     else { pidx = computeBWT(T, SA, C, B, n, k); }
//   }
// 
//   return pidx;
// #ifndef _OPENMP
// # undef maxthreads
// #endif
// }
// 
// } /* namespace saisxx_private */
// 
// 
// /**
//  * @brief Constructs the suffix array of a given string in linear time.
//  * @param T[0..n-1] The input string. (random access iterator)
//  * @param SA[0..n-1] The output array of suffixes. (random access iterator)
//  * @param n The length of the given string.
//  * @param k The alphabet size.
//  * @return 0 if no error occurred, -1 or -2 otherwise.
//  */
// template<typename string_type, typename sarray_type, typename index_type>
// int
// saisxx(string_type T, sarray_type SA, index_type n, index_type k = 256) {
//   int err;
//   if((n < 0) || (k <= 0)) { return -1; }
//   if(n <= 1) { if(n == 1) { SA[0] = 0; } return 0; }
//   try { err = saisxx_private::suffixsort(T, SA, 0U, n, k, false); }
//   catch(...) { err = -2; }
//   return err;
// }
// 
// /**
//  * @brief Constructs the burrows-wheeler transformed string of a given string in linear time.
//  * @param T[0..n-1] The input string. (random access iterator)
//  * @param U[0..n-1] The output string. (random access iterator)
//  * @param A[0..n-1] The temporary array. (random access iterator)
//  * @param n The length of the given string.
//  * @param k The alphabet size.
//  * @return The primary index if no error occurred, -1 or -2 otherwise.
//  */
// template<typename string_type, typename sarray_type, typename index_type>
// index_type
// saisxx_bwt(string_type T, string_type U, sarray_type A, index_type n, index_type k = 256) {
// typedef typename std::iterator_traits<string_type>::value_type char_type;
//   index_type i, pidx;
//   if((n < 0) || (k <= 0)) { return -1; }
//   if(n <= 1) { if(n == 1) { U[0] = T[0]; } return n; }
//   try {
//     pidx = saisxx_private::suffixsort(T, A, 0, n, k, true);
//     if(0 <= pidx) {
//       U[0] = T[n - 1];
//       for(i = 0; i < pidx; ++i) { U[i + 1] = (char_type)A[i]; }
//       for(i += 1; i < n; ++i) { U[i] = (char_type)A[i]; }
//       pidx += 1;
//     }
//   } catch(...) { pidx = -2; }
//   return pidx;
// }
// 
// 
// #endif /* __cplusplus */
// #endif /* _SAIS_HXX */
// /*
//  * esa.hxx
//  * Copyright (c) 2010 Daisuke Okanohara All Rights Reserved.
//  *
//  * Permission is hereby granted, free of charge, to any person
//  * obtaining a copy of this software and associated documentation
//  * files (the "Software"), to deal in the Software without
//  * restriction, including without limitation the rights to use,
//  * copy, modify, merge, publish, distribute, sublicense, and/or sell
//  * copies of the Software, and to permit persons to whom the
//  * Software is furnished to do so, subject to the following
//  * conditions:
//  *
//  * The above copyright notice and this permission notice shall be
//  * included in all copies or substantial portions of the Software.
//  *
//  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//  * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
//  * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//  * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//  * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
//  * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
//  * OTHER DEALINGS IN THE SOFTWARE.
//  */
// 
// #ifndef _ESA_HXX
// #define _ESA_HXX
// 
// #include <vector>
// #include <utility>
// #include <cassert>
// #include "sais.hxx"
// 
// namespace esaxx_private {
// template<typename string_type, typename sarray_type, typename index_type>
// index_type suffixtree(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D, index_type n){
//   if (n == 0){
//     return 0;
//   }
//   sarray_type Psi = L;
//   Psi[SA[0]] = SA[n-1];
//   for (index_type i = 1; i < n; ++i){
//     Psi[SA[i]] = SA[i-1];
//   }
// 
//   // Compare at most 2n log n charcters. Practically fastest
//   // "Permuted Longest-Common-Prefix Array", Juha Karkkainen, CPM 09
//   sarray_type PLCP = R;
//   index_type h = 0;
//   for (index_type i = 0; i < n; ++i){
//     index_type j = Psi[i];
//     while (i+h < n && j+h < n && 
// 	   T[i+h] == T[j+h]){
//       ++h;
//     }
//     PLCP[i] = h;
//     if (h > 0) --h;
//   }
// 
//   sarray_type H = L;
//   for (index_type i = 0; i < n; ++i){
//     H[i] = PLCP[SA[i]];
//   }
//   H[0] = -1;
// 
//   std::vector<std::pair<index_type, index_type> > S;
//   S.push_back(std::make_pair((index_type)-1, (index_type)-1));
//   size_t nodeNum = 0;
//   for (index_type i = 0; ; ++i){
//     std::pair<index_type, index_type> cur (i, (i == n) ? -1 : H[i]);
//     std::pair<index_type, index_type> cand(S.back());
//     while (cand.second > cur.second){
//       if (i - cand.first > 1){
// 	L[nodeNum] = cand.first;
// 	R[nodeNum] = i;
// 	D[nodeNum] = cand.second;
// 	++nodeNum;
//       }
//       cur.first = cand.first;
//       S.pop_back();
//       cand = S.back();
//     }
//     if (cand.second < cur.second){
//       S.push_back(cur);
//     }
//     if (i == n) break;
//     S.push_back(std::make_pair(i, n - SA[i] + 1));
//   }
//   return nodeNum;
// }
// }
// 
// /**
//  * @brief Build an enhanced suffix array of a given string in linear time
//  * For an input text T, esaxx() builds an enhancd suffix array in linear time. 
//  * i-th internal node is represented as a triple (L[i], R[i], D[i]); 
//  *   L[i] and R[i] is the left/right boundary of the suffix array as SA[L[i]....R[i]-1]
//  *   D[i] is the depth of the internal node
//  * The number of internal node is at most N-1 and return the actual number by 
//  * @param T[0...n-1]  The input string. (random access iterator)
//  * @param SA[0...n-1] The output suffix array (random access iterator)
//  * @param L[0...n-1]  The output left boundary of internal node (random access iterator)
//  * @param R[0...n-1]  The output right boundary of internal node (random access iterator)
//  * @param D[0...n-1]  The output depth of internal node (random access iterator)
//  * @param n The length of the input string
//  * @param k The alphabet size
//  * @pram nodeNum The output the number of internal node
//  * @return 0 if succeded, -1 or -2 otherwise 
//  */
// 
// template<typename string_type, typename sarray_type, typename index_type>
// int esaxx(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D,
//      index_type n, index_type k, index_type& nodeNum) {
//   if ((n < 0) || (k <= 0)) return -1;
//   int err = saisxx(T, SA, n, k);
//   if (err != 0){
//     return err;
//   }
//   nodeNum = esaxx_private::suffixtree(T, SA, L, R, D, n);
//   return 0;
// }
// 
// 
// #endif // _ESA_HXX
// /*
//  * esa.hxx
//  * Copyright (c) 2010 Daisuke Okanohara All Rights Reserved.
//  *
//  * Permission is hereby granted, free of charge, to any person
//  * obtaining a copy of this software and associated documentation
//  * files (the "Software"), to deal in the Software without
//  * restriction, including without limitation the rights to use,
//  * copy, modify, merge, publish, distribute, sublicense, and/or sell
//  * copies of the Software, and to permit persons to whom the
//  * Software is furnished to do so, subject to the following
//  * conditions:
//  *
//  * The above copyright notice and this permission notice shall be
//  * included in all copies or substantial portions of the Software.
//  *
//  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//  * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
//  * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//  * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//  * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
//  * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//  * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
//  * OTHER DEALINGS IN THE SOFTWARE.
//  */
// 
// #ifndef _ESA_HXX
// #define _ESA_HXX
// 
// #include <vector>
// #include <utility>
// #include <cassert>
// #include "sais.hxx"
// 
// namespace esaxx_private {
// template<typename string_type, typename sarray_type, typename index_type>
// index_type suffixtree(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D, index_type n){
//   if (n == 0){
//     return 0;
//   }
//   sarray_type Psi = L;
//   Psi[SA[0]] = SA[n-1];
//   for (index_type i = 1; i < n; ++i){
//     Psi[SA[i]] = SA[i-1];
//   }
// 
//   // Compare at most 2n log n charcters. Practically fastest
//   // "Permuted Longest-Common-Prefix Array", Juha Karkkainen, CPM 09
//   sarray_type PLCP = R;
//   index_type h = 0;
//   for (index_type i = 0; i < n; ++i){
//     index_type j = Psi[i];
//     while (i+h < n && j+h < n && 
// 	   T[i+h] == T[j+h]){
//       ++h;
//     }
//     PLCP[i] = h;
//     if (h > 0) --h;
//   }
// 
//   sarray_type H = L;
//   for (index_type i = 0; i < n; ++i){
//     H[i] = PLCP[SA[i]];
//   }
//   H[0] = -1;
// 
//   std::vector<std::pair<index_type, index_type> > S;
//   S.push_back(std::make_pair((index_type)-1, (index_type)-1));
//   size_t nodeNum = 0;
//   for (index_type i = 0; ; ++i){
//     std::pair<index_type, index_type> cur (i, (i == n) ? -1 : H[i]);
//     std::pair<index_type, index_type> cand(S.back());
//     while (cand.second > cur.second){
//       if (i - cand.first > 1){
// 	L[nodeNum] = cand.first;
// 	R[nodeNum] = i;
// 	D[nodeNum] = cand.second;
// 	++nodeNum;
//       }
//       cur.first = cand.first;
//       S.pop_back();
//       cand = S.back();
//     }
//     if (cand.second < cur.second){
//       S.push_back(cur);
//     }
//     if (i == n) break;
//     S.push_back(std::make_pair(i, n - SA[i] + 1));
//   }
//   return nodeNum;
// }
// }
// 
// /**
//  * @brief Build an enhanced suffix array of a given string in linear time
//  * For an input text T, esaxx() builds an enhancd suffix array in linear time. 
//  * i-th internal node is represented as a triple (L[i], R[i], D[i]); 
//  *   L[i] and R[i] is the left/right boundary of the suffix array as SA[L[i]....R[i]-1]
//  *   D[i] is the depth of the internal node
//  * The number of internal node is at most N-1 and return the actual number by 
//  * @param T[0...n-1]  The input string. (random access iterator)
//  * @param SA[0...n-1] The output suffix array (random access iterator)
//  * @param L[0...n-1]  The output left boundary of internal node (random access iterator)
//  * @param R[0...n-1]  The output right boundary of internal node (random access iterator)
//  * @param D[0...n-1]  The output depth of internal node (random access iterator)
//  * @param n The length of the input string
//  * @param k The alphabet size
//  * @pram nodeNum The output the number of internal node
//  * @return 0 if succeded, -1 or -2 otherwise 
//  */
// 
// template<typename string_type, typename sarray_type, typename index_type>
// int esaxx(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D,
//      index_type n, index_type k, index_type& nodeNum) {
//   if ((n < 0) || (k <= 0)) return -1;
//   std::count<<"Here"<<std::endl;
//   int err = saisxx(T, SA, n, k);
//   if (err != 0){
//     return err;
//   }
//   std::cout<<"suffixtree"<<std::endl;
//   nodeNum = esaxx_private::suffixtree(T, SA, L, R, D, n);
//   std::count<<"ok"<<std::endl;
//   return 0;
// }
// 
// 
// #endif // _ESA_HXX

#include <cstdint>
#include "esa.hxx"

extern "C"{

int esaxx_int32(char32_t* T, int32_t* SA, int32_t* L, int32_t* R, int32_t* D,
     int32_t n, int32_t k, int32_t &nodeNum) {

    return esaxx(T, SA, L, R, D, n, k, nodeNum);
}
}



