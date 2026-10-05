# Ensaio da implantação numa máquina virtual

Antes de o mini PC chegar, a instalação inteira é ensaiada numa **máquina virtual (VM)
com o Linux Mint**, no PC de desenvolvimento (Windows 11 Pro, Hyper-V). O objetivo é
rodar o `ops/instalar.sh` **do zero** e conferir tudo o que o mini PC vai fazer:
- subir sozinho depois de reiniciar;
- backup no HD externo e aviso quando o HD sai;
- restaurar uma cópia;
- atualizações de segurança automáticas.

Tempo: 1h30 a 2h, a maior parte esperando instalação.

Cada comando diz **onde** roda:

| Marca | Onde |
|---|---|
| 🪟 **PowerShell** | No Windows, PowerShell normal (sem administrador) |
| 🪟 **PowerShell (admin)** | No Windows: menu Iniciar → "PowerShell" → botão direito → *Executar como administrador* |
| 🐧 **Terminal do Mint** | Dentro da VM: `Ctrl+Alt+T`. Os comandos com `sudo` pedem a senha do usuário `suporte` |

---

## 0. Antes de começar

- **Espaço em disco: ~25 GB livres no C:.** Hoje há 15 GB. O Docker Desktop costuma
  guardar imagens de projetos antigos; para ver o que dá para liberar:
  🪟 **PowerShell** → `docker system df`.
- **Hyper-V:** já está ligado neste PC (o serviço `vmms` está rodando). Nada a fazer.
- **Baixe o Linux Mint 22.3 Cinnamon (64 bits):** <https://linuxmint.com/download.php>.
  Salve o arquivo `linuxmint-22.3-cinnamon-64bit.iso` (≈ 3 GB) na pasta **Downloads**.
  Use a 22.x: o `instalar.sh` foi feito para a base Ubuntu 24.04. O Mint 23 só sai em
  dezembro de 2026.

## 1. Publicar a versão de ensaio (v1.0.0-rc.1)

A VM baixa o sistema do GitHub, como o mini PC vai fazer. Então a versão de ensaio
precisa estar publicada.

🪟 **PowerShell**, na pasta do projeto (`C:\projetos\oficina-sistema`):

```powershell
git push origin dev
git tag -a v1.0.0-rc.1 -m "Ensaio da 1.0 na VM"
git push origin v1.0.0-rc.1
```

1. Abra <https://github.com/Massayuki2213/oficina-sistema/actions> e espere o **CI** da
   tag `v1.0.0-rc.1` ficar verde (uns 10 minutos). O último job ("Imagem Docker")
   publica a imagem.
2. **Só na primeira vez:** deixe a imagem pública, para o mini PC baixar sem senha.
   GitHub → sua foto → **Your profile** → aba **Packages** → `oficina-sistema` →
   **Package settings** → *Danger Zone* → **Change visibility** → **Public**.

## 2. Criar a VM

🪟 **PowerShell (admin)**: copie e cole o bloco inteiro.

```powershell
$pasta = "C:\VMs\HermesMint"
$iso   = "$env:USERPROFILE\Downloads\linuxmint-22.3-cinnamon-64bit.iso"
New-Item -ItemType Directory -Force $pasta | Out-Null
New-VM -Name HermesMint -Generation 2 -MemoryStartupBytes 4GB -SwitchName "Default Switch" `
  -Path $pasta -NewVHDPath "$pasta\sistema.vhdx" -NewVHDSizeBytes 40GB
Set-VMProcessor -VMName HermesMint -Count 2
Set-VMMemory -VMName HermesMint -DynamicMemoryEnabled $false
Set-VMFirmware -VMName HermesMint -SecureBootTemplate MicrosoftUEFICertificateAuthority
Set-VM -Name HermesMint -AutomaticCheckpointsEnabled $false -CheckpointType Standard
Add-VMDvdDrive -VMName HermesMint -Path $iso
Set-VMFirmware -VMName HermesMint -FirstBootDevice (Get-VMDvdDrive -VMName HermesMint)
Start-VM -Name HermesMint
vmconnect.exe localhost HermesMint
```

Abre a janela da VM, já ligando pelo pendrive virtual do Mint. O disco de 40 GB só
ocupa o que for usado.

## 3. Instalar o Linux Mint

Na janela da VM:

1. Espere a área de trabalho do Mint e dê dois cliques em **Install Linux Mint**.
2. Idioma **Português do Brasil**, teclado **Português (Brasil)**.
3. *Codecs multimídia*: pode deixar desmarcado.
4. *Tipo de instalação*: **Apagar disco e instalar o Linux Mint** → Instalar agora →
   Continuar. Só o disco virtual de 40 GB é apagado; o seu PC não é tocado.
5. Fuso: **São Paulo**.
6. *Quem é você?*:
   - Seu nome: `Suporte`
   - Nome do computador: `hermes-oficina`
   - Usuário: `suporte`
   - Uma senha que você não vai esquecer
   - **Exigir senha para entrar** (não marque o login automático)
7. No fim, ele pede para **remover a mídia de instalação e apertar Enter**. Antes do
   Enter, tire o pendrive virtual: 🪟 **PowerShell (admin)** →
   `Set-VMDvdDrive -VMName HermesMint -Path $null`. Depois volte à VM e aperte Enter.
8. Entre com o usuário `suporte` e feche a tela de boas-vindas.

## 4. Guardar o "Mint limpo"

Um ponto de restauração da VM recém-instalada. Com ele dá para repetir o ensaio do
zero em segundos.

🪟 **PowerShell (admin)**:

```powershell
Checkpoint-VM -Name HermesMint -SnapshotName "Mint limpo"
```

## 5. "Conectar" o HD externo

O HD de backup vira um segundo disco virtual, de 20 GB, plugado com a VM ligada,
como o HD USB na oficina.

🪟 **PowerShell (admin)**:

```powershell
New-VHD -Path C:\VMs\HermesMint\hd-externo.vhdx -SizeBytes 20GB -Dynamic | Out-Null
Add-VMHardDiskDrive -VMName HermesMint -ControllerType SCSI -Path C:\VMs\HermesMint\hd-externo.vhdx
```

## 6. Instalar o Hermes

🐧 **Terminal do Mint**:

```bash
sudo apt install -y git
sudo git clone --branch v1.0.0-rc.1 https://github.com/Massayuki2213/oficina-sistema.git /opt/hermes
sudo /opt/hermes/ops/instalar.sh
```

O script mostra 9 passos. As perguntas são estas:

- **Passo 5 (HD externo):** ele lista os discos, sem o do sistema. Digite `/dev/sdb`
  (o de 20 GB, "Virtual Disk") e depois `APAGAR` para formatar.
- **Passo 7 (Tailscale):** aparece um link `https://login.tailscale.com/...`. Abra no
  navegador (pode ser no Windows) e entre com uma conta Tailscale (é gratuita; entre
  com Google ou GitHub). Para ensaiar sem o Tailscale, rode o instalador com
  `--sem-tailscale`.

O fim mostra os endereços. Anote o **"Na rede da oficina"** (algo como
`http://172.x.x.x`).

## 7. Conferir

Marque cada item:

- [ ] **Do Windows**, no navegador: `http://<IP da VM>` abre a tela de primeiro acesso.
      Crie o Dono.
- [ ] **Na VM**, no Firefox: `http://localhost` abre o mesmo sistema.
- [ ] **Configurações → Backup → Fazer backup agora**. O bloco **"HD externo
      conectado"** fica verde, com as cópias. O sistema também faz uma sozinho
      15 segundos depois de subir.
- [ ] 🐧 `sudo ls -l /srv/hermes/backups /mnt/hermes-backup`: a mesma cópia nos dois
      lugares, e o arquivo `.hermes-hd-externo` no HD.
- [ ] **Sobe sozinho:** 🐧 `sudo reboot`. **Sem entrar na VM**, espere 2 minutos e
      abra `http://<IP da VM>` no Windows. O sistema está no ar.
- [ ] **HD arrancado:** 🪟 **PowerShell (admin)**:
      ```powershell
      Get-VMHardDiskDrive -VMName HermesMint | Where-Object Path -like '*hd-externo*' | Remove-VMHardDiskDrive
      ```
      Depois 🐧 `sudo systemctl start hermes-hd.service`. Sem esse comando, ele confere
      sozinho em até 5 minutos. Recarregue o **Painel** como Dono: aparece **"Backup
      precisa de atenção — O HD externo não está conectado"**.
- [ ] **HD de volta:** 🪟 **PowerShell (admin)**:
      ```powershell
      Add-VMHardDiskDrive -VMName HermesMint -ControllerType SCSI -Path C:\VMs\HermesMint\hd-externo.vhdx
      ```
      Depois 🐧 `sudo systemctl start hermes-hd.service`. Recarregue o Painel: o
      aviso **some**, sem reiniciar nada.
- [ ] **Restaurar:**
      1. Cadastre um cliente "Teste Restauração".
      2. 🐧 `sudo /opt/hermes/ops/backup-agora.sh`
      3. Apague ou mude o cliente.
      4. 🐧 `sudo /opt/hermes/ops/restaurar.sh`: Enter escolhe a mais nova; depois
         digite `RESTAURAR`.

      O cliente volta como estava, e todos precisam entrar de novo.
- [ ] **Rodar de novo não estraga nada:** 🐧 `sudo /opt/hermes/ops/instalar.sh`. Tudo
      aparece como "já ...", sem perguntar do HD. O Dono e os dados continuam lá.
- [ ] **Atualizações de segurança:**
      ```bash
      sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i "allowed origins"
      ```
      A linha mostra `noble-security`.
- [ ] **Versões:** 🐧 `sudo /opt/hermes/ops/atualizar.sh` mostra a instalada
      (`v1.0.0-rc.1`) e as disponíveis.
- [ ] *(Com Tailscale)* Instale o Tailscale no Windows (<https://tailscale.com/download>)
      com a mesma conta. `http://<IP Tailscale da VM>` (o `100.x.x.x` do resumo) abre o
      sistema. Pelo terminal, 🪟 **PowerShell** `ssh suporte@hermes-oficina` entra na
      VM (o Tailscale pode pedir para confirmar no navegador). É assim que o suporte
      chega no mini PC da oficina.

## 8. Do zero, de novo (opcional, mas vale)

Volta a VM ao "Mint limpo" e repete os passos 6 e 7.

🪟 **PowerShell (admin)**:

```powershell
Restore-VMCheckpoint -VMName HermesMint -Name "Mint limpo" -Confirm:$false
Start-VM -Name HermesMint
Add-VMHardDiskDrive -VMName HermesMint -ControllerType SCSI -Path C:\VMs\HermesMint\hd-externo.vhdx
```

Desta vez o HD já tem a marca do Hermes. No passo 5, o instalador avisa que **aproveita
sem formatar** (as cópias antigas continuam lá). É o caso de reinstalar o mini PC e
manter o mesmo HD.

## 9. O que me mandar

- Qualquer item do passo 7 que **não** deu certo: um print, e o texto do terminal.
- Se o `instalar.sh` parar com ✘: o texto inteiro do terminal, desde o comando.
- 🐧 `sudo docker compose -f /opt/hermes/docker-compose.prod.yml ps`

## Faxina (quando terminar)

🪟 **PowerShell (admin)**:

```powershell
Stop-VM -Name HermesMint -TurnOff -Force
Remove-VM -Name HermesMint -Force
Remove-Item C:\VMs\HermesMint -Recurse -Force
```

Com a VM apagada, também dá para desligar o dispositivo no Tailscale: painel
<https://login.tailscale.com/admin/machines> → `hermes-oficina` → *Remove*.
