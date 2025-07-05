/*
 * esa.hxx
 * Copyright (c) 2010 Daisuke Okanohara All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

#ifndef _ESA_HXX
#define _ESA_HXX

#include <vector>
#include <utility>
#include <cassert>
#include "sais.hxx"

namespace esaxx_private {
template<typename string_type, typename sarray_type, typename index_type>
index_type suffixtree(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D, index_type n){
  if (n == 0){
    return 0;
  }
  sarray_type Psi = L;
  Psi[SA[0]] = SA[n-1];
  for (index_type i = 1; i < n; ++i){
    Psi[SA[i]] = SA[i-1];
  }

  // Compare at most 2n log n charcters. Practically fastest
  // "Permuted Longest-Common-Prefix Array", Juha Karkkainen, CPM 09
  sarray_type PLCP = R;
  index_type h = 0;
  for (index_type i = 0; i < n; ++i){
    index_type j = Psi[i];
    while (i+h < n && j+h < n && 
	   T[i+h] == T[j+h]){
      ++h;
    }
    PLCP[i] = h;
    if (h > 0) --h;
  }

  sarray_type H = L;
  for (index_type i = 0; i < n; ++i){
    H[i] = PLCP[SA[i]];
  }
  H[0] = -1;

  std::vector<std::pair<index_type, index_type> > S;
  S.push_back(std::make_pair((index_type)-1, (index_type)-1));
  size_t nodeNum = 0;
  for (index_type i = 0; ; ++i){
    std::pair<index_type, index_type> cur (i, (i == n) ? -1 : H[i]);
    std::pair<index_type, index_type> cand(S.back());
    while (cand.second > cur.second){
      if (i - cand.first > 1){
	L[nodeNum] = cand.first;
	R[nodeNum] = i;
	D[nodeNum] = cand.second;
	++nodeNum;
      }
      cur.first = cand.first;
      S.pop_back();
      cand = S.back();
    }
    if (cand.second < cur.second){
      S.push_back(cur);
    }
    if (i == n) break;
    S.push_back(std::make_pair(i, n - SA[i] + 1));
  }
  return nodeNum;
}
}

/**
 * @brief Build an enhanced suffix array of a given string in linear time
 * For an input text T, esaxx() builds an enhancd suffix array in linear time. 
 * i-th internal node is represented as a triple (L[i], R[i], D[i]); 
 *   L[i] and R[i] is the left/right boundary of the suffix array as SA[L[i]....R[i]-1]
 *   D[i] is the depth of the internal node
 * The number of internal node is at most N-1 and return the actual number by 
 * @param T[0...n-1]  The input string. (random access iterator)
 * @param SA[0...n-1] The output suffix array (random access iterator)
 * @param L[0...n-1]  The output left boundary of internal node (random access iterator)
 * @param R[0...n-1]  The output right boundary of internal node (random access iterator)
 * @param D[0...n-1]  The output depth of internal node (random access iterator)
 * @param n The length of the input string
 * @param k The alphabet size
 * @pram nodeNum The output the number of internal node
 * @return 0 if succeded, -1 or -2 otherwise 
 */

template<typename string_type, typename sarray_type, typename index_type>
int esaxx(string_type T, sarray_type SA, sarray_type L, sarray_type R, sarray_type D,
     index_type n, index_type k, index_type& nodeNum) {
  if ((n < 0) || (k <= 0)) return -1;
  int err = saisxx(T, SA, n, k);
  if (err != 0){
    return err;
  }
  nodeNum = esaxx_private::suffixtree(T, SA, L, R, D, n);
  return 0;
}


#endif // _ESA_HXX

