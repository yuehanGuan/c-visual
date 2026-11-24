#include <cstdio>
#include <map>
#include <set>
#include <string>
using namespace std;
int main() {
    map<string,int> m;
    m["apple"] = 3;
    m["banana"] = 5;
    set<int> s;
    s.insert(3); s.insert(1); s.insert(2);
    pair<int,int> p = {7, 8};
    printf("%d %zu\n", m["apple"], s.size());
    return 0;
}
