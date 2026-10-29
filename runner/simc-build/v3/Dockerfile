# M11-G4-6: simc-build/3, the REPRODUCIBLE SimulationCraft engine recipe.
#
# simc-build/2 (runner/simc-build/v2/) pins every input, but two --no-cache
# builds of the same inputs produced different binaries (M11-G4-5): the
# engine embeds __DATE__/__TIME__, and the LLVM PGO training run used every
# core (engine default threads=0), so scheduling reached the merged profile.
# simc-build/3 keeps everything simc-build/2 pins and removes both:
#
#   - SOURCE_DATE_EPOCH is the checked-out commit's own committer time, so
#     __DATE__/__TIME__ are a function of the commit (clang honours it);
#   - the PGO training run is single-threaded (threads=1) as well as
#     deterministic (deterministic=1).
#
# Reproducibility is a claim checked by building twice: build.mjs
# --expect-binary <sha256> fails with NOT_REPRODUCED unless the rebuilt
# binary hashes the same. simc-build/1 and /2 stay unchanged for the
# artifacts they built.
#
# Build with runner/simc-build/v3/build.mjs (writes the build record).

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
 && test "$(git rev-parse HEAD)" = "${SIMC_COMMIT}" \
 && git log -1 --format=%ct HEAD > /simc.source-date-epoch \
 && grep -Eq '^[0-9]+$' /simc.source-date-epoch

WORKDIR /app/SimulationCraft

RUN set -eu \
 && export SOURCE_DATE_EPOCH="$(cat /simc.source-date-epoch)" \
 && make -C engine release CXX=clang++ -j "${THREADS}" LTO_THIN=1 LLVM_PGO_GENERATE=1 OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1 \
 && LLVM_PROFILE_FILE="code-%p.profraw" ./engine/simc "${PGO_PROFILE}" single_actor_batch=1 iterations=100 deterministic=1 threads=1 \
 && llvm-profdata merge -output=./engine/code.profdata code-*.profraw \
 && sha256sum engine/code.profdata > /simc.profdata.sha256 \
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
COPY --from=build /simc.sha256 /simc.commit /simc.source-date-epoch /simc.profdata.sha256 /toolchain-packages.txt /toolchain-compiler.txt /opt/simc/
RUN cp /runtime-packages.txt /opt/simc/runtime-packages.txt

USER simc
WORKDIR /work
ENTRYPOINT ["/opt/simc/simc"]
