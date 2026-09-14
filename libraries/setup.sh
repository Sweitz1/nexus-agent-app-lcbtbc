#!/usr/bin/env bash
# Master setup script — installs libraries for all languages
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================"
echo "  Libraries Setup"
echo "======================================================"

usage() {
    echo "Usage: ./setup.sh [all|python|java|cpp|javascript|ai-ml|submodules]"
    echo "  Defaults to 'all' if no argument given."
}

setup_python() {
    echo ""
    echo "==> Python"
    cd "$ROOT/python"
    bash setup.sh
}

setup_java() {
    echo ""
    echo "==> Java (Maven)"
    cd "$ROOT/java"
    if command -v mvn &>/dev/null; then
        mvn dependency:resolve -q
        echo "✓ Java dependencies resolved"
    else
        echo "⚠ Maven not found. Install from https://maven.apache.org"
    fi
}

setup_cpp() {
    echo ""
    echo "==> C++ (vcpkg)"
    if [ -z "$VCPKG_ROOT" ]; then
        echo "⚠ VCPKG_ROOT not set. Install vcpkg: https://vcpkg.io/en/getting-started"
        echo "  Then run: export VCPKG_ROOT=/path/to/vcpkg"
    else
        cd "$ROOT/cpp"
        cmake -B build -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
        cmake --build build
        echo "✓ C++ build complete"
    fi
}

setup_javascript() {
    echo ""
    echo "==> JavaScript / Node.js"
    cd "$ROOT/javascript"
    if command -v npm &>/dev/null; then
        npm install
        echo "✓ JS dependencies installed"
    else
        echo "⚠ npm not found. Install Node.js from https://nodejs.org"
    fi
}

setup_aiml() {
    echo ""
    echo "==> AI / ML (Python)"
    cd "$ROOT/ai-ml"
    if command -v python3 &>/dev/null; then
        python3 -m pip install --upgrade pip
        pip install -r requirements.txt
        echo "✓ AI/ML libraries installed"
    else
        echo "⚠ python3 not found"
    fi
}

setup_submodules() {
    echo ""
    echo "==> Initializing git submodules (shallow clones)..."
    echo "    WARNING: This will clone ~20 large repos. It may take a while."
    read -r -p "    Continue? [y/N] " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        cd "$ROOT"
        git submodule update --init --recursive --depth 1
        echo "✓ Submodules initialized"
    else
        echo "Skipped submodules."
    fi
}

TARGET="${1:-all}"

case "$TARGET" in
    python)      setup_python ;;
    java)        setup_java ;;
    cpp)         setup_cpp ;;
    javascript)  setup_javascript ;;
    ai-ml)       setup_aiml ;;
    submodules)  setup_submodules ;;
    all)
        setup_python
        setup_java
        setup_cpp
        setup_javascript
        setup_aiml
        setup_submodules
        ;;
    help|-h|--help) usage ;;
    *)
        echo "Unknown target: $TARGET"
        usage
        exit 1
        ;;
esac

echo ""
echo "======================================================"
echo "  Setup complete!"
echo "======================================================"
