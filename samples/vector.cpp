#include <cstdio>
#include <vector>
using namespace std;

int main() {
    vector<int> v;
    for (int i = 0; i < 5; i++) {
        v.push_back((i + 1) * 10);
    }
    printf("size=%zu\n", v.size());
    return 0;
}
