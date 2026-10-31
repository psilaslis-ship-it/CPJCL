# Lumen DMX

Console de iluminação para a interface **Sourlight SL3000** (Enttec Open DMX) e os equipamentos DMX da igreja. A versão recomendada agora é o aplicativo instalável pelo Microsoft Edge, sem executável próprio nem instalador bloqueado pelo Controle Inteligente de Aplicativos do Windows.

## Versão para Edge (recomendada)

1. Abra `https://lumen-igreja-dmx.silas-portugal.chatgpt.site` no Microsoft Edge do computador de controle e entre na conta autorizada, se solicitado.
2. No menu `…` do Edge, escolha **Aplicativos → Instalar este site como aplicativo**. O atalho instalado abre uma janela própria.
3. Feche o FreeStyler, conecte a SL3000 e clique em **Conectar interface**. No seletor do navegador, escolha a **USB Serial Port** do adaptador FTDI (COM17 na máquina em que foi identificado; o número pode mudar).
4. Confira os endereços e modos dos aparelhos em **Equipamentos**. Depois configure as cenas e sequências. A janela precisa ficar aberta enquanto as luzes estiverem em uso.

O navegador precisa oferecer a API Web Serial e permitir acesso à porta. A saída DMX usa 250000 baud, com BREAK/MAB e 512 canais; ainda requer verificação com os aparelhos reais. O FreeStyler e o Lumen não podem manter a mesma porta aberta ao mesmo tempo.

As configurações são salvas neste navegador. Use **Configurações → Exportar configuração** para criar um JSON de backup e **Importar configuração** para migrar dados (inclusive um JSON exportado pelo Lumen anterior). O aplicativo busca novas versões em segundo plano e mostra um aviso discreto; só instala quando o usuário confirma, interrompendo o DMX e recarregando a janela.

### Cenas e perfis de canais

Os novos cadastros seguem o mapa visível nas imagens do FreeStyler: movings de 12 canais nos endereços 1 e 13; ribaltas de 2 canais em 25 e 27; PAR LEDs de 8 canais em 29, 37, 45 e 53. **Dados já salvos não são alterados automaticamente.** Em **Equipamentos → Usar mapa das imagens**, é possível trocar apenas o cadastro dos aparelhos após confirmar; exporte um backup antes e revise as cenas existentes.

Em **Equipamentos → Editar**, cada canal pode ter nome, função e valores nomeados (por exemplo, `Azul=40; Verde=75`). Os valores de roda de cores, gobo e efeitos **não foram inferidos das fotos**; consulte o manual ou teste o aparelho para cadastrá-los. Em **Cenas → Editar**, ajuste a posição do moving no quadro, escolha cor RGB dos PAR LEDs e refine qualquer canal entre 0 e 255. **Testar luz sem salvar** envia os valores atuais aos aparelhos. Sequências aceitam tempo de transição e permanência por cena; a transição suaviza posição, intensidade e RGB, enquanto rodas e efeitos mudam diretamente.

O código da versão para navegador está em `web/`. O servidor apenas entrega os arquivos; a porta USB é acessada localmente no navegador, sem enviar quadros DMX pela internet.

Se o site privado não abrir no Edge, execute `npm run web` dentro do projeto e abra `http://localhost:8765` no Edge. Nesse modo, mantenha também o terminal aberto. A atualização automática do código hospedado não atualiza a cópia local: para ela, faça `git pull` com o Lumen fechado e inicie novamente.

## Versão Electron anterior (legado)

## Executar no computador de controle

1. Instale o driver já usado pela SL3000.
2. Instale Node.js LTS.
3. No diretório do projeto, execute `npm install` e depois `npm start`.
4. No Lumen, abra **Interface USB**, escolha a porta COM do adaptador e conecte.

## Dados e portabilidade

As cenas, sequências e equipamentos são salvos em `%APPDATA%/Lumen DMX/lumen-config.json`. Use **Exportar configuração** para gerar um JSON e **Importar configuração** na outra máquina.

## Distribuição e atualização manual

`npm run dist` cria versão portátil e instalador em `release/`. As atualizações são publicadas manualmente em GitHub Releases. O aplicativo mostra uma indicação discreta quando há versão nova; a instalação depende da ação do operador e reinicia o aplicativo apenas depois de o download ser concluído.

> Sem certificado de assinatura, o Windows pode exibir aviso de SmartScreen para instaladores baixados da internet. Isso não pode ser removido por software; distribuir o executável portátil internamente reduz o atrito, mas a solução definitiva é assinar o pacote com certificado de código.
