# M11-G4-5: simc-build/2, the HARDENED SimulationCraft engine recipe.
#
# Owner decision (M11 closeout, 2026-10-28): before the next model build, pin
# the immutable base AND the exact package/toolchain inputs as far as
# practical. Relative to simc-build/1 (runner/simc-build/Dockerfile, kept
# unchanged for the artifacts it built):
#
#   - the Alpine base is a committed digest (alpine.digest), never a tag;
#   - EVERY package of each stage is installed at the exact version listed in
#     toolchain-build.lock / toolchain-runtime.lock (the full closure), and the
#     build FAILS unless the installed set equals the lock. If the mirrors no
#     longer serve a pinned version, the build fails rather than drifting;
#   - the LLVM PGO training run is deterministic (deterministic=1), so the
#     profile, and with it the binary, does not depend on a random seed;
#   - SIMC_COMMIT has no default: the caller names the exact commit.
#
# Unchanged from simc-build/1: the official recipe's toolchain and make
# invocation (thin LTO + PGO over CI.simc), the exact-commit checkout verified
# by full hash, SC_NO_NETWORKING=1, no API key, an unprivileged runtime user.
#
# Build with runner/simc-build/v2/build.mjs (writes the build record).

ARG ALPINE_DIGEST

FROM alpine@${ALPINE_DIGEST} AS build

ARG THREADS=1
ARG SIMC_COMMIT
ARG PGO_PROFILE=CI.simc

COPY toolchain-build.lock /toolchain-build.lock

RUN set -eu \
 && test -n "${SIMC_COMMIT}" \
 && grep -v '^#' /toolchain-build.lock | sed -E 's/^(.+)-([^-]+-r[0-9]+)$/\1=\2/' > /toolchain-build.pins \
 && apk --no-cache add $(cat /toolchain-build.pins) \
 && apk info -v | sort > /toolchain-packages.txt \
 && grep -v '^#' /toolchain-build.lock | sort | diff - /toolchain-packages.txt \
 && clang++ --version > /toolchain-compiler.txt

RUN git clone https://github.com/simulationcraft/simc.git /app/SimulationCraft \
 && cd /app/SimulationCraft \
 && git checkout --detach "${SIMC_COMMIT}" \
 && test "$(git rev-parse HEAD)" = "${SIMC_COMMIT}"

WORKDIR /app/SimulationCraft

RUN make -C engine release CXX=clang++ -j "${THREADS}" LTO_THIN=1 LLVM_PGO_GENERATE=1 OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1 \
 && LLVM_PROFILE_FILE="code-%p.profraw" ./engine/simc "${PGO_PROFILE}" single_actor_batch=1 iterations=100 deterministic=1 \
 && llvm-profdata merge -output=./engine/code.profdata code-*.profraw \
 && make -C engine clean \
 && make -C engine release CXX=clang++ -j "${THREADS}" LTO_THIN=1 LLVM_PGO_USE=./code.profdata OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1 \
 && sha256sum engine/simc > /simc.sha256 \
 && git rev-parse HEAD > /simc.commit

FROM alpine@${ALPINE_DIGEST}

COPY toolchain-runtime.lock /toolchain-runtime.lock

RUN set -eu \
 && grep -v '^#' /toolchain-runtime.lock | sed -E 's/^(.+)-([^-]+-r[0-9]+)$/\1=\2/' > /toolchain-runtime.pins \
 && apk --no-cache add $(cat /toolchain-runtime.pins) \
 && apk info -v | sort > /runtime-packages.txt \
 && grep -v '^#' /toolchain-runtime.lock | sort | diff - /runtime-packages.txt \
 && adduser -D -H -s /sbin/nologin simc

COPY --from=build /app/SimulationCraft/engine/simc /opt/simc/simc
COPY --from=build /simc.sha256 /simc.commit /toolchain-packages.txt /toolchain-compiler.txt /opt/simc/
RUN cp /runtime-packages.txt /opt/simc/runtime-packages.txt

USER simc
WORKDIR /work
ENTRYPOINT ["/opt/simc/simc"]
