# Libraries

A curated collection of the best open source libraries, frameworks, and tools — organized by language. Includes setup scripts and links to top projects in AI/ML, Linux, and more.

## Directory Structure

| Folder | Languages / Domain |
|--------|--------------------|
| [python/](./python/) | Python libraries & frameworks |
| [java/](./java/) | Java & JVM libraries |
| [cpp/](./cpp/) | C & C++ libraries |
| [javascript/](./javascript/) | JavaScript / Node.js / TypeScript |
| [ai-ml/](./ai-ml/) | AI, ML, and Deep Learning |
| [linux/](./linux/) | Linux kernel, tools & system libs |
| [rust/](./rust/) | Rust crates and tools |
| [go/](./go/) | Go modules and frameworks |

## Quick Setup

Run the master setup script to install libraries for all languages:

```bash
chmod +x setup.sh
./setup.sh
```

Or set up a single language:

```bash
./python/setup.sh
./java/setup.sh
./cpp/setup.sh
./javascript/setup.sh
./ai-ml/setup.sh
```

## Submodules (Top Open Source Projects)

This repo links the following projects as git submodules:

- **Linux Kernel** — `submodules/linux`
- **PyTorch** — `submodules/pytorch`
- **TensorFlow** — `submodules/tensorflow`
- **Hugging Face Transformers** — `submodules/transformers`
- **llama.cpp** — `submodules/llama.cpp`
- **LangChain** — `submodules/langchain`
- **Ollama** — `submodules/ollama`
- **OpenCV** — `submodules/opencv`
- **React** — `submodules/react`
- **FFmpeg** — `submodules/ffmpeg`

To clone this repo with all submodules:

```bash
git clone --recurse-submodules https://github.com/sweitz1/libraries.git
```

Or initialize submodules after cloning:

```bash
git submodule update --init --recursive
```
