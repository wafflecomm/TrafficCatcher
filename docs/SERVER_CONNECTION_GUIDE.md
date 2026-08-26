# Traffic Catcher 서버 접속 가이드

## 확인된 서버 환경

- 서버 유형: AWS EC2
- 운영체제: Amazon Linux 2023
- SSH 사용자: `ec2-user`
- 로그인 후 기본 경로: `/home/ec2-user`

## 접속 정보 보관 위치

실제 퍼블릭 IP, 퍼블릭 DNS, 인스턴스 ID와 SSH 개인 키 경로는 프로젝트 루트의 `.env.server.txt`에 보관합니다.

`.env.server.txt`와 개인 키 파일은 비공개 접속 정보입니다. GitHub에 커밋하거나 메신저·문서에 실제 값을 복사하지 않습니다. 현재 저장소에서는 `*.txt` 규칙으로 Git 추적에서 제외됩니다.

## Windows PowerShell에서 접속

`.env.server.txt`에서 퍼블릭 IP와 SSH 개인 키 경로를 확인한 다음 아래 자리표시자만 실제 값으로 바꿉니다.

```powershell
ssh -i "<SSH_PRIVATE_KEY_PATH>" ec2-user@<PUBLIC_IPV4>
```

퍼블릭 DNS를 사용할 때는 다음과 같습니다.

```powershell
ssh -i "<SSH_PRIVATE_KEY_PATH>" ec2-user@<PUBLIC_IPV4_DNS>
```

예를 들어 개인 키 경로에는 `.pem` 파일의 전체 Windows 경로를 사용합니다. 개인 키 내용을 명령이나 문서에 붙여 넣지 않습니다.

## 접속 확인

정상 접속되면 프롬프트가 다음 형태로 표시됩니다.

```text
[ec2-user@ip-... ~]$
```

서버와 현재 경로는 아래 명령으로 확인합니다.

```bash
uname -s
pwd
whoami
```

정상 확인값은 각각 `Linux`, `/home/ec2-user`, `ec2-user`입니다.

## 연결 종료

```bash
exit
```

또는 `Ctrl+D`를 누릅니다.

## 자주 발생하는 오류

### `Permission denied (publickey)`

- SSH 사용자가 `ec2-user`인지 확인합니다.
- `-i` 뒤에 지정한 `.pem` 파일이 해당 EC2 인스턴스의 개인 키인지 확인합니다.
- 인스턴스 ID를 SSH 사용자명으로 사용하면 안 됩니다.

### `Connection timed out`

- EC2 인스턴스가 실행 중인지 확인합니다.
- 현재 퍼블릭 IP 또는 퍼블릭 DNS가 변경되지 않았는지 확인합니다.
- AWS 보안 그룹의 인바운드 규칙에서 TCP 22번 포트가 현재 접속 IP에 허용되어 있는지 확인합니다.

### 호스트 키 확인 메시지

최초 접속 시 서버 지문을 확인한 후 `yes`를 입력합니다. 서버가 교체되지 않았는데 호스트 키 변경 경고가 나오면 즉시 접속을 중단하고 서버 정보를 먼저 확인합니다.

## 보안 원칙

- `.pem` 개인 키는 서버나 GitHub에 업로드하지 않습니다.
- 개인 키 파일을 이메일이나 메신저로 전달하지 않습니다.
- SSH 22번 포트는 가능하면 전체 공개(`0.0.0.0/0`) 대신 관리자 접속 IP만 허용합니다.
- 서버 명령을 실행하기 전에 현재 사용자와 경로를 확인합니다.
- 운영 데이터 삭제, 서비스 재시작, 배포 명령은 대상과 영향 범위를 확인한 뒤 실행합니다.
