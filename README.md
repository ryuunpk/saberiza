# Saberiza — plataforma inicial de ensinamentos

**Versão:** 0.1 · **Foco:** celular Android · **Custo inicial planejado:** R$ 0, dentro dos limites dos planos gratuitos.

Saberiza é uma base funcional para uma biblioteca de ensinamentos. O site público usa HTML, CSS e JavaScript; o Supabase armazena o conteúdo, realiza o login administrativo e aplica as regras de acesso no banco. O repositório do GitHub não é usado como mecanismo de segurança.

> **Importante:** os arquivos estão prontos para configuração, mas a plataforma ainda não está conectada a nenhuma conta. Enquanto você não configurar o Supabase, ela mostrará claramente que falta conexão e não fingirá que salvou publicações. O teste real de autenticação e RLS só pode acontecer depois de configurar seu próprio projeto.

## 1. O que já está incluído

- Página inicial responsiva com pesquisa, categorias escolares e conhecimentos gerais.
- Navegação por etapa escolar → ano/série → matéria; categorias adicionais podem ser criadas no painel.
- Página individual com link compartilhável, texto formatado em Markdown seguro, capa por URL HTTPS, aviso de segurança, referências e cores personalizáveis.
- Painel `admin.html` com login do Supabase, contagem real de publicados/rascunhos/despublicados, criação, edição, duplicação, publicação, despublicação e exclusão com confirmação.
- Gerenciamento inicial de categorias: adicionar, renomear, reordenar e ativar/desativar sem apagar os ensinamentos relacionados.
- Busca de texto no banco, carregamento paginado, favoritos guardados apenas no navegador e tema claro/escuro.
- Registro de ações administrativas sem armazenar senhas ou tokens.
- Políticas RLS para impedir leitura pública de rascunhos e bloquear escrita de quem não está na lista de administradores.
- Um ensinamento inicial marcado explicitamente como `EXEMPLO`; apague ou edite depois de confirmar que tudo funciona.

## 2. O que ainda não está incluído nesta primeira versão

Para não fingir que funcionalidades estão prontas quando dependem de trabalho adicional:

- **Upload de imagem:** o editor aceita uma URL HTTPS; o armazenamento de arquivos no Supabase Storage fica para uma etapa posterior.
- **IA integrada por API:** não há chave de IA nem chamada automática. Use revisão manual copiando o texto para uma ferramenta de IA e trazendo a sugestão de volta. Confira fatos e referências antes de publicar.
- **Exercícios, questionários, histórico de leitura sincronizado e progresso por conta:** ficam para uma etapa posterior. Os favoritos atuais ficam somente no navegador deste aparelho.
- **Vídeos incorporados, edição de referências em campos estruturados e editor visual rico:** a primeira versão usa um campo de texto com Markdown limitado, justamente para evitar que um artigo execute HTML ou JavaScript.
- **E-mail de contato e política de privacidade definitiva:** substitua os textos de exemplo antes de divulgar o site.
- **Backups automáticos no plano gratuito:** faça exportações próprias regularmente. Não trate a hospedagem gratuita como garantia de disponibilidade ou recuperação.

## 3. Arquivos e para que servem

```text
index.html                 Página inicial e pesquisa
content.html               Página individual de ensinamento
admin.html                 Login e painel administrativo
privacidade.html           Modelo inicial de política de privacidade
css/styles.css             Estilos responsivos e temas
js/config.js               Nome do site, URL e chave pública do Supabase
js/supabase-client.js      Cliente Supabase; não contém segredos
js/ui.js                   Componentes visuais e formatação segura de texto
js/public.js               Categorias, pesquisa, listagem e favoritos
js/content.js              Leitura de artigo e apresentação personalizada
js/admin.js                Login, editor, categorias, publicações e histórico
supabase/schema.sql        Tabelas, índices, políticas RLS e categorias iniciais
.nojekyll                  Ajuda o GitHub Pages a servir arquivos estáticos
README.md                  Este guia
```

## 4. Antes de começar — segurança e ferramentas

Você precisará de uma conta GitHub e uma conta Supabase, ambas com acesso gratuito. O plano gratuito do GitHub Pages exige repositório público. Portanto, o código-fonte poderá ser visto por qualquer pessoa; **não coloque senhas nem chaves secretas no projeto**.

No Supabase, use a chave de navegador chamada **Publishable key** (começa com `sb_publishable_`) e a URL do projeto. Essas informações identificam o projeto e podem ser vistas no navegador; a segurança depende das políticas RLS. **Nunca use `sb_secret_`, `service_role`, senha do banco ou outra credencial privilegiada no site.**

## 5. Configurar o banco no Supabase pelo celular

1. Abra `https://supabase.com` no navegador do Moto G14 e entre na sua conta.
2. Crie um projeto novo. Guarde a senha do banco em um local seguro fora do repositório; esta aplicação não precisa colocá-la no código.
3. Abra **SQL Editor** → **New query**.
4. Abra o arquivo `supabase/schema.sql` neste pacote, copie o conteúdo inteiro e cole no editor SQL do Supabase. Toque em **Run**.
5. Confirme que a execução terminou sem erro. O script cria as tabelas `categories`, `teachings`, `admin_users` e `admin_logs`, índices, a função `is_admin()`, as políticas RLS e a estrutura inicial de categorias.

Se o Supabase mostrar erro, não tente adivinhar nem remover as políticas. Copie a mensagem de erro sem incluir senhas ou tokens e investigue a causa antes de continuar.

## 6. Criar a única conta administrativa

1. No Supabase, abra **Authentication** → **Users** → **Add user** (o texto pode variar um pouco).
2. Cadastre seu e-mail administrativo e uma senha longa e exclusiva. Não use o cadastro público do site: a aplicação não oferece formulário de criação de conta.
3. Depois que o usuário aparecer na lista, copie o seu **User UID**.
4. Volte a **SQL Editor** e rode este comando, substituindo o texto indicado pelo UUID real:

```sql
insert into public.admin_users (user_id)
values ('COLE-AQUI-O-UUID-DO-USUARIO');
```

5. Na configuração de Authentication, desative novos cadastros públicos, se essa opção estiver habilitada. Apenas criar um usuário autenticado não o torna administrador: o painel exige uma linha correspondente em `admin_users` e o banco verifica a permissão em cada operação protegida.

**Nunca** crie um botão no site para inserir administradores, nem conceda privilégios por um valor escrito no JavaScript.

## 7. Conectar o site ao projeto Supabase

1. No painel Supabase, abra a área de conexão/API do projeto e copie a **Project URL** e a **Publishable key**.
2. No arquivo `js/config.js`, substitua somente estes dois valores:

```js
export const SUPABASE_URL = "COLE_A_URL_DO_PROJETO_AQUI";
export const SUPABASE_PUBLISHABLE_KEY = "COLE_A_CHAVE_PUBLICAVEL_AQUI";
```

3. Não cole uma chave `sb_secret_`, `service_role`, senha do banco nem token pessoal. A chave publishable é pública por design; as políticas RLS são obrigatórias.
4. Você também pode mudar `SITE_NAME` e `SITE_TAGLINE` no mesmo arquivo.

## 8. Publicar gratuitamente no GitHub Pages

1. Entre em `https://github.com` e crie um repositório **público** com um nome simples, por exemplo `saberiza`.
2. Extraia o ZIP do projeto no celular. No GitHub, envie os arquivos do projeto mantendo a estrutura de pastas: a pasta `css` precisa conter `styles.css`; a pasta `js` precisa conter os arquivos JavaScript; e a pasta `supabase` precisa conter `schema.sql`. `index.html` fica na raiz do repositório.
3. Se a interface móvel não permitir enviar a pasta inteira, entre na pasta correspondente do repositório e envie seus arquivos separadamente, preservando os nomes e caminhos indicados acima.
4. No repositório, abra **Settings** → **Pages**.
5. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/(root)` e salve.
6. Aguarde o status de publicação aparecer na tela do GitHub. O endereço será parecido com `https://SEU-USUARIO.github.io/saberiza/`.
7. Abra o site e confirme que a página aparece. O navegador precisa de internet para carregar a biblioteca do Supabase via CDN e consultar o banco.

**A URL do site varia** de acordo com seu nome de usuário e repositório. Não copie o exemplo literalmente.

## 9. Configurar os links de autenticação e recuperação

No Supabase, abra **Authentication** → **URL Configuration** (os nomes podem variar):

- Defina a URL principal do site com o endereço do GitHub Pages publicado.
- Adicione a URL de redirecionamento da página administrativa, incluindo `admin.html?reset=1`, à lista de URLs permitidas para recuperação de senha. Exemplo de formato: `https://SEU-USUARIO.github.io/saberiza/admin.html?reset=1`.
- Use os endereços exatos do seu site. Não use o endereço de exemplo como se fosse o seu.

O envio de e-mails e os limites de autenticação dependem da configuração e das cotas atuais do Supabase. Teste o fluxo de recuperação antes de depender dele. Se o e-mail não chegar, use o painel do Supabase para restaurar o acesso e verifique a configuração do provedor de e-mail.

## 10. Testar a primeira versão

Faça estes testes em uma janela normal e, depois, em uma janela anônima do navegador:

1. A página inicial mostra as categorias criadas no banco e o conteúdo marcado como `EXEMPLO`.
2. Pesquisar uma palavra do título ou corpo retorna o conteúdo correspondente.
3. Abrir um ensinamento mostra seu título, conteúdo e endereço compartilhável.
4. No painel, faça login com o usuário que está cadastrado em `admin_users`.
5. Crie um ensinamento como **Rascunho** e salve. Atualize a página: o rascunho deve continuar listado no painel.
6. Abra a URL do rascunho em uma janela anônima: o leitor não deve conseguir vê-lo.
7. Edite o rascunho, troque as cores, salve e confirme que a prévia e a página publicada refletem as alterações.
8. Publique o ensinamento; ele deve ficar disponível publicamente sem alterar `index.html`.
9. Despublique o conteúdo e confirme que a URL pública deixa de mostrar o artigo.
10. Crie uma categoria de teste, atribua um ensinamento a ela e confirme que a navegação funciona.
11. Entre com uma conta autenticada que **não** esteja em `admin_users` (caso você crie uma conta de teste). Essa conta não deve conseguir criar, editar, publicar ou excluir conteúdo. Não adicione a conta de teste à tabela de administradores.
12. Na aba Network/Console do navegador, erros de permissão não devem revelar rascunhos. Em caso de dúvida, teste o acesso diretamente pela API/cliente do Supabase, não apenas escondendo botões.

## 11. Como revisar com IA sem pagar API

1. Escreva o texto original no editor e salve como rascunho.
2. Copie o texto para uma ferramenta de IA e peça revisão de ortografia, pontuação e clareza, solicitando que preserve o sentido e marque fatos que precisam ser conferidos. Peça para não inventar fontes.
3. Compare o texto original com a sugestão. Rejeite mudanças que não representem o que você queria ensinar.
4. Cole a versão revisada no editor, confira as fontes e os avisos de segurança, salve e só então publique.

Nenhuma chave de IA é necessária para esse procedimento manual. Uma futura integração automática precisaria de um serviço de backend seguro; uma chave de IA nunca deve ficar no JavaScript público.

## 12. Como voltar a editar pelo Moto G14

- Para escrever conteúdos: abra `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/admin.html`, entre e use o editor.
- Para mudar cores ou textos visuais globais, use o ACode para editar `js/config.js` ou `css/styles.css`, depois atualize os arquivos no GitHub.
- Para adicionar novos ensinamentos, use o painel. Não edite `index.html` para cada publicação.
- Antes de excluir ou alterar muitas categorias, faça uma exportação dos dados no painel Supabase. As categorias usam relações com os artigos, e o banco bloqueia a exclusão que deixaria referências quebradas.

## Limites e avisos de operação

- GitHub Pages é hospedagem estática: não executa PHP, Python ou código de servidor. A camada de dados/autenticação é um serviço separado.
- A disponibilidade, cotas de chamadas, e-mail, armazenamento e políticas dos planos gratuitos podem mudar. Verifique o painel e as páginas oficiais antes de depender da plataforma para uso amplo.
- O projeto ainda precisa de teste real no seu próprio Supabase. A sintaxe dos arquivos JavaScript foi verificada localmente; isso não substitui testar SQL, autenticação, políticas RLS e recuperação de senha na sua conta.
- O site usa `content.html?id=UUID` para os links de artigos, evitando depender de configuração de rotas no GitHub Pages.
- A política de privacidade é apenas um modelo inicial. Revise-a para descrever os serviços e práticas que realmente estiver usando.


## 13. Documentação oficial para conferir limites atuais

As telas, cotas e nomes de configurações podem mudar. Consulte os documentos oficiais antes de publicar para um público grande:

- GitHub Pages — visão geral: https://docs.github.com/pt/pages/getting-started-with-github-pages
- Limites de uso do GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Supabase — preços e cotas: https://supabase.com/pricing
- Supabase — proteção de dados e RLS: https://supabase.com/docs/guides/database/secure-data
- Supabase — chaves de API: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase — pausa de projetos gratuitos: https://supabase.com/docs/guides/platform/free-project-pausing
