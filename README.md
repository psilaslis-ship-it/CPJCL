# Lumen DMX

Aplicativo local para Windows destinado ao controle da interface **Sourlight SL3000** (Enttec Open DMX) e de equipamentos DMX da igreja.

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
