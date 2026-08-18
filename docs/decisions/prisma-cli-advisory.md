# Prisma CLI 의존성 보안 예외

## 상태

- 결정일: 2026-08-18
- 재검토 기한: 2026-08-25 또는 첫 배포 전 중 빠른 시점
- 대상: `prisma@7.9.1` → `@prisma/config@7.9.1` → `deepmerge-ts@7.1.5`
- Advisory: `GHSA-ggr8-5vv4-36mx`

## 결정

Prisma 7.9.1을 유지하고 upstream의 호환 가능한 수정판을 기다린다. `npm audit fix --force`, Prisma 6 강제 다운그레이드, `deepmerge-ts` 8의 임의 override는 적용하지 않는다.

`npm audit`에 표시되는 high 3건은 서로 다른 취약점 세 개가 아니라 위 단일 전이 경로다. 취약 코드는 Prisma CLI가 설정을 읽는 경로에 있고 애플리케이션의 `PrismaClient` 요청 처리 경로에는 포함되지 않는다. 현재 `prisma.config.ts`는 저장소가 관리하는 문자열과 일반 객체만 사용하며, advisory의 순환 객체 병합 조건을 외부 요청으로 만들 수 없다.

## 통제

- 운영 애플리케이션 프로세스에서 Prisma CLI를 실행하지 않는다.
- `prisma.config.ts`에 네트워크·사용자 입력 또는 동적 객체 병합을 추가하지 않는다.
- CI와 개발 환경에서만 `prisma validate`, `prisma generate`를 실행한다.
- Prisma가 수정된 `deepmerge-ts`를 공식 채택하면 Prisma 정식 버전으로 업그레이드하고 전체 검증을 실행한다.
- advisory의 영향 범위가 앱 런타임으로 확대되거나 악용 조건이 바뀌면 이 예외를 즉시 폐기한다.

## 재검증

업그레이드 시 다음 명령을 모두 통과해야 한다.

```text
npm audit
npm run prisma:validate
npm run prisma:generate
npm run verify
```
