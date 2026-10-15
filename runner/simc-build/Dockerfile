# M11-G3-1: the candidate production SimulationCraft engine artifact.
#
# Derived from SimulationCraft's official Dockerfile at the approved pin
# (github.com/simulationcraft/simc/blob/33622e9d…/Dockerfile): the same
# Alpine + clang toolchain, the same `make -C engine release` invocation with
# thin LTO and LLVM profile-guided optimisation over the CI.simc profile.
# Deviations, each deliberate:
#
#   - the base image is pinned BY DIGEST (both stages), never `alpine:latest`;
#   - the source is a git checkout of the EXACT commit, verified by full hash,
#     because the Makefile embeds `git rev-parse --short HEAD` only when a
#     .git directory and git are present — that is how the binary reports its
#     own revision in its JSON output;
#   - SC_NO_NETWORKING=1 compiles networking out (the pinned Makefile then
#     defines SC_NO_NETWORKING and drops -lcurl), so curl-dev / libcurl are
#     not installed at all;
#   - no SC_DEFAULT_APIKEY;
#   - the runtime stage runs as an unprivileged user and records the
#     toolchain manifest beside the binary.
#
# Build (the digest is recorded in runner/simc-build/build-record.json):
#   docker build --build-arg ALPINE_DIGEST=sha256:<digest> --build-arg THREADS=<n> \
#     -t wlc-simc:33622e9d runner/simc-build

ARG ALPINE_DIGEST

FROM alpine@${ALPINE_DIGEST} AS build

ARG THREADS=1
ARG SIMC_COMMIT=33622e9d1662ff0e451691edf85a6b49cc9d11d9
ARG PGO_PROFILE=CI.simc

RUN apk --no-cache add compiler-rt clang-dev llvm g++ make git \
 && apk info -v | sort > /toolchain-packages.txt \
 && clang++ --version > /toolchain-compiler.txt

RUN git clone https://github.com/simulationcraft/simc.git /app/SimulationCraft \
 && cd /app/SimulationCraft \
 && git checkout --detach "${SIMC_COMMIT}" \
 && test "$(git rev-parse HEAD)" = "${SIMC_COMMIT}"

WORKDIR /app/SimulationCraft

RUN make -C engine release CXX=clang++ -j "${THREADS}" LTO_THIN=1 LLVM_PGO_GENERATE=1 OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1 \
 && LLVM_PROFILE_FILE="code-%p.profraw" ./engine/simc "${PGO_PROFILE}" single_actor_batch=1 iterations=100 \
 && llvm-profdata merge -output=./engine/code.profdata code-*.profraw \
 && make -C engine clean \
 && make -C engine release CXX=clang++ -j "${THREADS}" LTO_THIN=1 LLVM_PGO_USE=./code.profdata OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1 \
 && sha256sum engine/simc > /simc.sha256 \
 && git rev-parse HEAD > /simc.commit

FROM alpine@${ALPINE_DIGEST}

RUN apk --no-cache add libgcc libstdc++ \
 && adduser -D -H -s /sbin/nologin simc

COPY --from=build /app/SimulationCraft/engine/simc /opt/simc/simc
COPY --from=build /simc.sha256 /simc.commit /toolchain-packages.txt /toolchain-compiler.txt /opt/simc/

USER simc
WORKDIR /work
ENTRYPOINT ["/opt/simc/simc"]
