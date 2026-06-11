# Linux Kernel & System Libraries

Top open source Linux, systems programming, and OS-level libraries and projects.

## The Linux Kernel
| Project | Description | Link |
|---------|-------------|------|
| [Linux Kernel](https://github.com/torvalds/linux) | The Linux kernel source tree | https://kernel.org |
| [Linux Stable](https://github.com/gregkh/linux) | Greg KH's stable tree | — |
| [BPF](https://github.com/torvalds/linux/tree/master/kernel/bpf) | eBPF subsystem (in-kernel) | — |

Linked as submodule: `../submodules/linux`

## System Call & OS Interfaces
| Library | Description | Install |
|---------|-------------|---------|
| [glibc](https://sourceware.org/git/glibc.git) | GNU C library | system package |
| [musl libc](https://git.musl-libc.org/cgit/musl) | Lightweight C library | `sudo apt install musl` |
| [liburing](https://github.com/axboe/liburing) | io_uring (fast async I/O) | `sudo apt install liburing-dev` |
| [libaio](https://pagure.io/libaio) | Linux async I/O | `sudo apt install libaio-dev` |

## eBPF & Observability
| Library | Description | Install |
|---------|-------------|---------|
| [bcc](https://github.com/iovisor/bcc) | BPF Compiler Collection | `sudo apt install bpfcc-tools` |
| [bpftrace](https://github.com/bpftrace/bpftrace) | High-level BPF tracing | `sudo apt install bpftrace` |
| [libbpf](https://github.com/libbpf/libbpf) | BPF user-space library | `sudo apt install libbpf-dev` |
| [Cilium](https://github.com/cilium/cilium) | eBPF networking | Kubernetes |
| [Falco](https://github.com/falcosecurity/falco) | Runtime security | Docker |

## Networking
| Library | Description | Install |
|---------|-------------|---------|
| [iproute2](https://github.com/iproute2/iproute2) | Linux networking tools | `sudo apt install iproute2` |
| [netfilter / iptables](https://git.netfilter.org/) | Packet filtering | `sudo apt install iptables` |
| [nftables](https://git.netfilter.org/nftables) | Modern packet filter | `sudo apt install nftables` |
| [DPDK](https://github.com/DPDK/dpdk) | Data Plane Development Kit | build from source |
| [XDP Tools](https://github.com/xdp-project/xdp-tools) | eXpress Data Path | build from source |

## Container & Virtualization
| Library | Description | Install |
|---------|-------------|---------|
| [runc](https://github.com/opencontainers/runc) | OCI container runtime | build from source |
| [containerd](https://github.com/containerd/containerd) | Container runtime | https://containerd.io |
| [cgroups v2](https://github.com/torvalds/linux/tree/master/kernel/cgroup) | Resource control | in-kernel |
| [KVM](https://github.com/torvalds/linux/tree/master/virt/kvm) | Kernel-based VM | in-kernel |
| [QEMU](https://github.com/qemu/qemu) | Machine emulator | `sudo apt install qemu-kvm` |

## File Systems
| Library | Description | Link |
|---------|-------------|------|
| [ext4](https://github.com/torvalds/linux/tree/master/fs/ext4) | Linux default FS | in-kernel |
| [Btrfs](https://github.com/torvalds/linux/tree/master/fs/btrfs) | Copy-on-write FS | in-kernel |
| [ZFS on Linux](https://github.com/openzfs/zfs) | OpenZFS | `sudo apt install zfsutils-linux` |
| [FUSE](https://github.com/libfuse/libfuse) | User-space filesystems | `sudo apt install libfuse3-dev` |
| [bcachefs](https://github.com/koverstreet/bcachefs) | Next-gen FS | kernel 6.7+ |

## System Monitoring & Debugging
| Library | Description | Install |
|---------|-------------|---------|
| [strace](https://github.com/strace/strace) | System call tracer | `sudo apt install strace` |
| [perf](https://github.com/torvalds/linux/tree/master/tools/perf) | Performance analysis | `sudo apt install linux-perf` |
| [valgrind](https://github.com/fredericgermain/valgrind) | Memory error detector | `sudo apt install valgrind` |
| [SystemTap](https://sourceware.org/git/systemtap.git) | Dynamic instrumentation | `sudo apt install systemtap` |
| [sysstat](https://github.com/sysstat/sysstat) | System performance tools | `sudo apt install sysstat` |

## Init & Service Management
| Library | Description | Link |
|---------|-------------|------|
| [systemd](https://github.com/systemd/systemd) | System and service manager | https://systemd.io |
| [OpenRC](https://github.com/OpenRC/openrc) | Dependency-based init | — |
| [s6](https://github.com/skarnet/s6) | Small, secure init | https://skarnet.org/software/s6 |

## Security
| Library | Description | Install |
|---------|-------------|---------|
| [SELinux](https://github.com/SELinuxProject/selinux) | Mandatory access control | `sudo apt install selinux-basics` |
| [AppArmor](https://gitlab.com/apparmor/apparmor) | Linux security module | `sudo apt install apparmor` |
| [auditd](https://github.com/linux-audit/audit-userspace) | Linux audit framework | `sudo apt install auditd` |
| [libseccomp](https://github.com/seccomp/libseccomp) | Seccomp filtering | `sudo apt install libseccomp-dev` |
