#include <cstdio>

int fib(int n) {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int r = fib(4);
    printf("%d\n", r);
    return 0;
}
