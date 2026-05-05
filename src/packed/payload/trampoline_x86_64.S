# Hod bootstrap trampoline for x86_64.
# Entry point that sets up args and calls the C bootstrap function,
# then jumps to the returned interpreter entry address.
#
# Adapted from onelf (https://github.com/QaidVoid/onelf) — MIT licensed.

.text
.globl _hod_start
_hod_start:
    # Save original stack pointer (argc/argv/envp/auxv).
    mov     %rsp, %rbp
    # Align stack to 16 bytes for C ABI.
    and     $-16, %rsp
    # arg1: pointer to original stack (argc at top)
    mov     %rbp, %rdi
    # arg2: pointer to metadata (right after this code)
    lea     _hod_metadata(%rip), %rsi
    # Preserve rdx (set by kernel to fini function pointer)
    mov     %rdx, %rbx
    call    _hod_bootstrap
    # rax = interpreter entry address
    # Restore original stack and rdx
    mov     %rbx, %rdx
    mov     %rbp, %rsp
    # Jump to interpreter
    jmp     *%rax

.globl _hod_metadata
_hod_metadata:
    # Filled in by inject_bootstrap():
    #   i64  entry_delta
    #   u16  rel_path_len
    #   char rel_path[]  (NUL-terminated)
