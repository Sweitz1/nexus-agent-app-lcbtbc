# AI / Machine Learning Libraries

Top open source AI, ML, and Deep Learning frameworks and tools.

## Deep Learning Frameworks
| Library | Description | Install |
|---------|-------------|---------|
| [PyTorch](https://github.com/pytorch/pytorch) | Leading research framework | `pip install torch torchvision torchaudio` |
| [TensorFlow](https://github.com/tensorflow/tensorflow) | Google's ML platform | `pip install tensorflow` |
| [JAX](https://github.com/google/jax) | Composable transformations + GPU | `pip install jax[cuda12]` |
| [Keras](https://github.com/keras-team/keras) | High-level neural networks | `pip install keras` |
| [MXNet](https://github.com/apache/mxnet) | Apache deep learning framework | `pip install mxnet` |
| [PaddlePaddle](https://github.com/PaddlePaddle/Paddle) | Baidu's deep learning platform | `pip install paddlepaddle` |

## Large Language Models & NLP
| Library | Description | Install |
|---------|-------------|---------|
| [Transformers](https://github.com/huggingface/transformers) | HuggingFace model hub | `pip install transformers` |
| [Datasets](https://github.com/huggingface/datasets) | HuggingFace datasets | `pip install datasets` |
| [PEFT](https://github.com/huggingface/peft) | Parameter-efficient fine-tuning | `pip install peft` |
| [TRL](https://github.com/huggingface/trl) | Transformer reinforcement learning | `pip install trl` |
| [LangChain](https://github.com/langchain-ai/langchain) | LLM application framework | `pip install langchain` |
| [LlamaIndex](https://github.com/run-llama/llama_index) | LLM data framework | `pip install llama-index` |
| [Ollama](https://github.com/ollama/ollama) | Run LLMs locally | https://ollama.ai/download |
| [llama.cpp](https://github.com/ggerganov/llama.cpp) | LLaMA in pure C/C++ | build from source |
| [vLLM](https://github.com/vllm-project/vllm) | High-throughput LLM serving | `pip install vllm` |
| [Text Generation Inference](https://github.com/huggingface/text-generation-inference) | HF TGI server | Docker |
| [Guidance](https://github.com/guidance-ai/guidance) | LLM control language | `pip install guidance` |
| [DSPy](https://github.com/stanfordnlp/dspy) | Programming LMs | `pip install dspy-ai` |

## Computer Vision
| Library | Description | Install |
|---------|-------------|---------|
| [OpenCV](https://github.com/opencv/opencv) | Computer vision library | `pip install opencv-python` |
| [Pillow](https://github.com/python-pillow/Pillow) | Image processing | `pip install pillow` |
| [Torchvision](https://github.com/pytorch/vision) | PyTorch vision utils | `pip install torchvision` |
| [Albumentations](https://github.com/albumentations-team/albumentations) | Image augmentation | `pip install albumentations` |
| [Detectron2](https://github.com/facebookresearch/detectron2) | Object detection | build from source |
| [YOLOv8 (Ultralytics)](https://github.com/ultralytics/ultralytics) | Object detection | `pip install ultralytics` |
| [SAM (Segment Anything)](https://github.com/facebookresearch/segment-anything) | Image segmentation | `pip install segment-anything` |
| [Diffusers](https://github.com/huggingface/diffusers) | Stable diffusion & more | `pip install diffusers` |

## MLOps & Infrastructure
| Library | Description | Install |
|---------|-------------|---------|
| [MLflow](https://github.com/mlflow/mlflow) | ML lifecycle management | `pip install mlflow` |
| [DVC](https://github.com/iterative/dvc) | Data version control | `pip install dvc` |
| [Weights & Biases](https://github.com/wandb/wandb) | Experiment tracking | `pip install wandb` |
| [Ray](https://github.com/ray-project/ray) | Distributed computing | `pip install ray[all]` |
| [Dask](https://github.com/dask/dask) | Parallel computing | `pip install dask` |
| [BentoML](https://github.com/bentoml/BentoML) | ML model serving | `pip install bentoml` |
| [Triton Server](https://github.com/triton-inference-server/server) | NVIDIA inference server | Docker |

## Vector Databases & Search
| Library | Description | Install |
|---------|-------------|---------|
| [FAISS](https://github.com/facebookresearch/faiss) | Efficient similarity search | `pip install faiss-cpu` |
| [Chroma](https://github.com/chroma-core/chroma) | AI-native vector DB | `pip install chromadb` |
| [Qdrant](https://github.com/qdrant/qdrant) | Vector similarity engine | Docker |
| [Weaviate](https://github.com/weaviate/weaviate) | AI-native vector database | Docker |
| [Pinecone (client)](https://github.com/pinecone-io/pinecone-python-client) | Managed vector DB | `pip install pinecone-client` |

## Reinforcement Learning
| Library | Description | Install |
|---------|-------------|---------|
| [Gymnasium](https://github.com/Farama-Foundation/Gymnasium) | RL environments (OpenAI Gym) | `pip install gymnasium` |
| [Stable Baselines3](https://github.com/DLR-RM/stable-baselines3) | RL algorithms | `pip install stable-baselines3` |
| [RLlib](https://github.com/ray-project/ray/tree/master/rllib) | Scalable RL | `pip install ray[rllib]` |
| [CleanRL](https://github.com/vwxyzjn/cleanrl) | Single-file RL implementations | `pip install cleanrl` |

## Audio
| Library | Description | Install |
|---------|-------------|---------|
| [Whisper](https://github.com/openai/whisper) | Speech recognition | `pip install openai-whisper` |
| [Librosa](https://github.com/librosa/librosa) | Audio analysis | `pip install librosa` |
| [TorchAudio](https://github.com/pytorch/audio) | Audio processing | `pip install torchaudio` |
| [Coqui TTS](https://github.com/coqui-ai/TTS) | Text-to-speech | `pip install TTS` |

## Top AI Model Repos (Submodules)
These are linked as git submodules in `../submodules/`:

| Model | Repo |
|-------|------|
| Meta LLaMA | https://github.com/meta-llama/llama |
| Mistral | https://github.com/mistralai/mistral-src |
| Stable Diffusion | https://github.com/CompVis/stable-diffusion |
| GPT-NeoX | https://github.com/EleutherAI/gpt-neox |
| BLOOM | https://github.com/bigscience-workshop/bigscience |
| Falcon | https://github.com/falconry/falcon |
| Whisper | https://github.com/openai/whisper |
