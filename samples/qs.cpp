#include <cstdio>
#include <queue>
#include <stack>
using namespace std;
int main() {
    queue<int> q;
    q.push(1); q.push(2); q.push(3);
    stack<int> st;
    st.push(10); st.push(20);
    printf("%d %d\n", q.front(), st.top());
    return 0;
}
