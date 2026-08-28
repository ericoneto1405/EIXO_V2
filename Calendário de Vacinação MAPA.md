# **Diretrizes de Engenharia e Regulação Sanitária Bovina para o Módulo de Sanidade do Sistema EIXO**

## **Panorama Regulatório Atual do MAPA e Transição Sanitária Nacional**

A estruturação de um módulo de sanidade animal para o sistema de gestão pecuária EIXO exige a incorporação do arcabouço normativo do Ministério da Agricultura e Pecuária (MAPA) e das diretrizes do Serviço Veterinário Oficial (SVO) operado pelas Secretarias Estaduais de Agricultura e Defesa Agropecuária. Historicamente, a gestão sanitária do rebanho bovino e bubalino no Brasil gravitava em torno do calendário de imunização massiva contra a febre aftosa. No entanto, o país concluiu uma transição epidemiológica com a consolidação do Plano Estratégico do Programa Nacional de Vigilância para a Febre Aftosa (PNEFA)1.  
Por meio das Portarias MAPA nº 665 e nº 678, publicadas em 2024, o Governo Federal reconheceu nacionalmente a totalidade das Unidades da Federação como zonas livres de febre aftosa sem vacinação1. Esse avanço abriu caminho para o reconhecimento internacional concedido pela Organização Mundial de Saúde Animal (OMSA/WOAH), declarando o território brasileiro como zona livre de febre aftosa sem imunização2. Em consequência desse novo status sanitário, o armazenamento, a distribuição, a comercialização e a aplicação de vacinas contra a febre aftosa foram proibidos em todo o país2.  
Para a arquitetura de software do sistema EIXO, essa mudança altera as regras de negócio sanitárias. O sistema deve desativar permanentemente os gatilhos automatizados de agendamento e alertas de campanhas de febre aftosa. O foco da conformidade regulatória passa a ser a gestão contínua e a auditoria rigorosa das vacinações compulsórias remanescentes — precipuamente a Brucelose e a Raiva dos Herbívoros —, além da integração de fluxos para a notificação compulsória imediata de síndromes febris vesiculares via sistema e-SISBRAVET e a validação do trânsito animal por meio da Guia de Trânsito Animal (GTA)1.

## **Programa Nacional de Controle e Erradicação da Brucelose e Tuberculose**

Com a suspensão das campanhas contra a febre aftosa, o Programa Nacional de Controle e Erradicação da Brucelose e da Tuberculose (PNCEBT) assumiu o posto de principal mecanismo de fiscalização sanitária obrigatória sobre as propriedades pecuárias no Brasil3. A regularidade da vacinação contra a brucelose é o condicionante para a manutenção da adimplência da propriedade rural e para a autorização de emissão de GTAs para qualquer finalidade3.

### **Especificações Técnicas dos Imunizantes e Regras de Aplicação**

A vacinação contra a brucelose é restrita exclusivamente a fêmeas bovinas e bubalinas, sendo vedada a aplicação em machos de qualquer idade. O programa oficial autoriza o emprego de dois imunizantes com especificações operacionais distintas:

* **Vacina B19 (Amostra 19 de *Brucella abortus*)**: Imunógeno vivo atenuado, indicado obrigatoriamente para fêmeas com idade entre 3 e 8 meses (90 a 240 dias), aplicado em dose única3. A aplicação da vacina B19 em fêmeas com idade superior a 8 meses é proibida, uma vez que induz a persistência de anticorpos aglutinantes que interferem nos testes sorológicos oficiais de diagnóstico da doença11. As bezerras imunizadas com a B19 devem obrigatoriamente ser marcadas a ferro candente ou nitrogênio líquido no lado esquerdo da face com o algarismo final do ano de aplicação (por exemplo, a marcação "6" para intervenções realizadas no ano de 2026\)3.  
* **Vacina RB51 (Amostra Rugosa Não Indutora de Anticorpos Aglutinantes)**: Formulação viva atenuada que não interfere nos exames sorológicos pós-vacinais de rotina3. Pode ser utilizada como alternativa à B19 para fêmeas de 3 a 8 meses, ou de forma compulsória na regularização sanitária de fêmeas adultas (com idade superior a 8 meses) que não foram vacinadas na idade correta3. Fêmeas vacinadas com a RB51 devem receber a marcação "V" na face esquerda12. Em determinadas legislações estaduais, como no estado de São Paulo, a aplicação de RB51 em fêmeas adultas exige a realização prévia de exame sorológico com resultado negativo para brucelose13.  
* **Exceções de Marcação**: Fêmeas destinadas ao registro genealógico oficial (animais puros de origem \- PO) ficam dispensadas da marcação a fogo na face, desde que estejam identificadas individualmente por métodos oficiais (brincos numéricos ou transponders) e que o atestado de vacinação correspondente acompanhe o animal em todo o seu trânsito12. Algumas Unidades da Federação admitem a substituição do ferro candente por identificadores auriculares plásticos coloridos com especificações oficiais13.

### **Calendário Nacional de Vacinação e Prazos de Comprovação**

A Portaria SDA/MAPA nº 1.633 padronizou a Campanha Nacional de Vacinação de Bezerras contra a Brucelose em dois períodos anuais de imunização, garantindo a coordenação do calendário entre o MAPA e os Serviços Veterinários Estaduais6:

* **Primeira Etapa (1º Semestre)**: A janela de aplicação compreende o período de **1º de janeiro a 30 de junho**. O produtor rural deve comprovar a imunização de todas as fêmeas que atingiram a faixa de 3 a 8 meses junto ao órgão de defesa sanitária até o dia **10 de julho** do ano corrente10.  
* **Segunda Etapa (2º Semestre)**: A janela de aplicação ocorre de **1º de julho a 31 de dezembro**. O prazo final para o protocolo do atestado de vacinação encerra-se no dia **10 de janeiro** do ano subsequente10.  
* **Exceção Territorial por Classificação de Risco**: As Unidades da Federação classificadas como "Risco A" para brucelose perante o MAPA estão dispensadas da obrigatoriedade do calendário de vacinação sistemática compulsória, adotando estratégias baseadas no monitoramento amostral, erradicação de focos e certificação voluntária de propriedades livres16.

A vacinação contra a brucelose não pode ser executada livremente pelo produtor rural. A norma exige que o procedimento seja realizado sob a responsabilidade técnica de um **médico-veterinário privado cadastrado** no Serviço Veterinário Oficial do estado onde a propriedade está localizada3. O fornecimento dos imunizantes pelas revendas agropecuárias é condicionado à apresentação de receituário médico-veterinário oficial retido9. O não cumprimento dos prazos de vacinação ou a falta de homologação do atestado sanitário dentro da janela limite acarretam a interdição imediata da propriedade para a emissão de GTAs de saída e entrada de animais3.

## **Programa Nacional de Controle da Raiva dos Herbívoros e Sazonalidade Estadual**

A Raiva dos Herbívoros, encefalopatia viral transmissível e zoonose letal, é gerida pelo Programa Nacional de Controle da Raiva dos Herbívoros (PNCRH) do MAPA3. Diferentemente da uniformidade nacional do calendário de brucelose, a vacinação antirrábica bovina possui caráter **compulsório regionalizado**, variando conforme o risco epidemiológico, a presença de abrigos do morcego hematófago *Desmodus rotundus* e o histórico de focos notificados por município3.

### **Esquema Imunológico da Raiva e Exigências da Primovacinação**

O protocolo de imunização contra a raiva deve obedecer à dinâmica de soroconversão dos herbívoros:

* **Idade Mínima de Aplicação**: A primeira dose deve ser administrada a partir dos **3 a 4 meses de idade**3.  
* **Dose de Reforço (Primovacinação)**: Animais imunizados pela primeira vez necessitam obrigatoriamente de uma dose de reforço aplicada entre **21 e 30 dias** após a dose inicial3. O módulo sanitário deve emitir alertas automáticos para essa segunda aplicação, visto que a omissão do reforço compromete o nível de anticorpos protetores e invalida a imunização perante a fiscalização.  
* **Revacinação do Rebanho**: Todo o rebanho localizado em municípios com vacinação compulsória deve ser revacinado **anualmente** (a cada 12 meses)3.

### **Regulamentação Regional e Variação por Unidade da Federação**

Cada órgão estadual de defesa agropecuária (como ADAF no Amazonas, ADEPARA no Pará, ADAB na Bahia, AGRODEFESA em Goiás, IAGRO em Mato Grosso do Sul, IMA em Minas Gerais e GEDAVE em São Paulo) publica portarias definindo a lista de municípios sob vacinação compulsória e os períodos de campanha3.  
Como ilustração da variabilidade regional, a Portaria ADEPARA nº 1.518, no estado do Pará, estabelece a vacinação obrigatória para todos os herbívoros com idade igual ou superior a 3 meses em municípios específicos, subdividindo o estado por regionais sanitárias com janelas distintas23:

* **Regionais de Castanhal e Capanema**: Vacinação anual entre **jan e junho**, com prazo limite de comprovação no SVE até **15 de julho**23.  
* **Regional de Soure (Arquipélago do Marajó)**: Vacinação anual concentrada entre **agosto e outubro**, com prazo final para protocolo da declaração até **15 de novembro**23.

No estado do Amazonas, a Portaria ADAF nº 158 determina a obrigatoriedade da vacinação antirrábica em todos os municípios que registrarem laudos laboratoriais positivos para a doença ou em áreas declaradas de risco alto22. Nos municípios classificados como obrigatórios pelos órgãos estaduais, o sistema SVE bloqueia a emissão de GTA caso a propriedade não comprove a vacinação de todo o rebanho dentro da validade de 12 meses3.

## **Manejo de Vacinações Não Compulsórias e Estratégias Produtivas**

Embora as vacinações contra brucelose e raiva constituam a espinha dorsal do compliance legal, a gestão de um rebanho de alta performance depende da execução de um calendário sanitário profilático para enfermidades de alto impacto econômico3. O sistema EIXO deve permitir a programação e o acompanhamento dessas aplicações não compulsórias:

* **Clostridioses (Carbúnculo Sintomático, Gangrena Gasosa, Tetanopatia, Enterotoxemia e Botulismo)**: As bactérias clostridiais são formadoras de esporos altamente resistentes que persistem no solo e no trato digestivo do gado20. A imunização é a principal ferramenta contra surtos de mortalidade súbita20. Recomenda-se aplicar a vacina polivalente (5, 8 ou 10 cepas) aos **3 meses de idade**, acompanhada de um **reforço após 30 dias**3. A revacinação deve ser feita **anualmente** para todo o rebanho, antecipando o período de transição entre seca e águas3. Em regiões com carência mineral de fósforo e histórico de osteofagia, a imunização contra o Botulismo exige duas doses iniciais com intervalo de 4 a 6 semanas e revacinação anual20.  
* **Complexo de Doenças Reprodutivas (IBR, BVD e Leptospirose)**: Causadoras de mortalidade embrionária, abortamentos, fetos mumificados e queda nas taxas de concepção9. As vacinas contra Rinotraqueíte Infecciosa Bovina (IBR) e Diarreia Viral Bovina (BVD) devem ser iniciadas aos 3 meses de idade, com reforço após 4 semanas e revacinação anual20. Em matrizes e touros em reprodução, o momento da revacinação deve ser agendado estrategicamente entre **30 e 60 dias antes do início da estação de monta**20.  
* **Leptospirose**: A vacinação contra a leptospirose exige um protocolo diferenciado, pois a imunidade induzida pelos bacterinas comerciais é de menor duração. Recomenda-se a primeira dose aos 4 a 6 meses de idade, reforço após 30 dias e **revacinações semestrais** em rebanhos leiteiros ou em sistemas de corte intensivos localizados em áreas de alta umidade20.  
* **Queratoconjuntivite Infecciosa e Mastite**: A imunização contra Queratoconjuntivite Infecciosa Bovina (*Moraxella bovis*) deve ser programada antes da seca (maio/junho), período caracterizado por maior insolação, poeira e proliferação de vetores (*Musca autumnalis*)25. Em rebanhos de aptidão leiteira, os protocolos vacinais contra Mastite (*Staphylococcus aureus*, *Streptococcus agalactiae* e coliformes) devem ser integrados ao módulo de pré-parto e secagem da vaca25.

## **Matriz Unificada do Calendário Sanitário Bovino por Estado e Categoria**

A tabela a seguir consolida o panorama regulatório e estratégico da vacinação bovina e bubalina no Brasil. Ela reúne o enquadramento legal, as categorias de animais elegíveis, as janelas de aplicação e as exigências junto ao Serviço Veterinário Oficial:

| Enfermidade | Caráter Regulatório | Público-Alvo e Faixa Etária | Esquema de Doses e Reforço | Janela Temporal / Sazonalidade | Diretrizes e Prazos de Comprovação SVE |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Brucelose (B19)** | Compulsório Nacional3 | Fêmeas bovinas e bubalinas de 3 a 8 meses3 | Dose única na vida3 | **1º Semestre**: Jan a Jun **2º Semestre**: Jul a Dez10 | Comprovação até **10/Julho** (1ª etapa) e **10/Janeiro** (2ª etapa)16. Marcação na face esquerda com dígito final do ano3. |
| **Brucelose (RB51)** | Compulsório / Regularização3 | Fêmeas de 3 a 8 meses ou fêmeas adultas (\>8 meses)3 | Dose única (adultas sob prescrição e sorologia)3 | Fluxo contínuo ou alinhado com etapas semestrais10 | Marcação na face esquerda com a letra "V"12. Exige Atestado emitido por Médico-Veterinário Cadastrado3. |
| **Raiva dos Herbívoros** | Compulsório Regional / Risco3 | Bovinos e bubalinos ![][image1] meses em áreas de risco3 | 1ª Dose aos 3-4 meses; Reforço em 21-30 dias; Revacinação anual3 | Definida pelo SVE local (Ex: PA: Jan-Jun ou Ago-Out)23 | Comprovação em 15 a 30 dias após encerramento da campanha23. Condiciona a emissão de GTA nos municípios do decreto3. |
| **Febre Aftosa** | **Proibido em todo o país** \[cite: 3, 4\] | Proibida para todas as categorias3 | Vacinação e comercialização suspensas3 | Desativado permanentemente3 | País reconhecido internacionalmente como Zona Livre sem Vacinação2. Foco em vigilância passiva1. |
| **Clostridioses** | Estratégico (Manejo Interno)3 | Todo o rebanho; Bezerros a partir de 3 meses3 | 1ª Dose aos 3 meses; Reforço em 30 dias; Revacinação anual3 | Pré-chuvoso (Out/Nov) ou entrada do confinamento/seca25 | Registro e controle no prontuário sanitário interno do EIXO3. Previne mortalidade súbita20. |
| **Leptospirose** | Estratégico (Manejo Interno)20 | Matrizes, touros e novilhas de reposição20 | 1ª Dose aos 4-6 meses; Reforço em 30 dias; Revacinação semestral ou anual20 | Semestral no gado de leite; Pré-monta no gado de corte20 | Registro interno de lote e validade do imunizante3. |
| **IBR / BVD** | Estratégico (Manejo Interno)20 | Plantel reprodutivo (Fêmeas e Touros)20 | 1ª Dose aos 3 meses; Reforço em 30 dias; Revacinação anual20 | **30 a 60 dias antes da Estação de Monta** \[cite: 20, 25\] | Redução de perdas reprodutivas e otimização das taxas de prenhez9. |

## **Requisitos de Engenharia de Software e Regras de Negócio para o Módulo EIXO**

A transposição dessas exigências sanitárias para o sistema EIXO requer a estruturação do domínio de dados, a implementação de motores de validação automática e a integração com módulos correlatos de manejo e reprodução.

### **Estruturação do Modelo de Dados do Domínio**

O banco de dados deve modelar as entidades fundamentais para assegurar o controle sanitário e a rastreabilidade dos procedimentos:

* **Entidade Propriedade Rural**: Armazena a localização geográfica, a Inscrição Estadual, o código de cadastro no Serviço Veterinário Estadual (GDA/SVE) e o código IBGE do município3. O código IBGE é a chave utilizada pelo sistema para identificar automaticamente se a propriedade está situada em um município sob decreto de vacinação compulsória para Raiva dos Herbívoros3.  
* **Entidade Perfil Profissional Veterinário**: Registra o nome, CPF, número do CRMV/UF, número de habilitação oficial no PNCEBT e a data de validade do credenciamento perante o SVE estadual3. A associação desse registro é obrigatória para a homologação dos lançamentos de vacinação contra Brucelose3.  
* **Entidade Lote Vacina (Estoque e Insumos)**: Rastreia o imunizante utilizado, incluindo a enfermidade alvo, fabricante, número da licença no MAPA, número do lote comercial, data de fabricação, data de validade e registros da cadeia de frio (faixa de armazenamento entre 2°C e 8°C)3.  
* **Entidade Registro Aplicação Sanitária**: Registra a execução da vacinação, relacionando a propriedade, os animais ou lotes vacinados, o lote da vacina, a data de aplicação, o veterinário responsável e a forma de identificação (marcação na face por dígito do ano, letra "V", identificador auricular ou dispensa para animais PO)3.

### **Motores de Regras e Validações Automáticas de Negócio**

O backend do sistema EIXO deve executar um motor de regras sanitárias para prevenir inconformidades cadastrais e operacionais:

> 1. **Filtros de Elegibilidade por Categoria, Idade e Sexo**:  
   * *Bloqueio de Sexo*: O sistema deve proibir o agendamento ou lançamento de vacina contra Brucelose (B19 ou RB51) para animais do sexo masculino.  
   * *Janela de Aplicação B19*: O sistema deve listar na dashboard de pendências sanitárias apenas as fêmeas que estejam entre 90 e 240 dias de vida (3 a 8 meses)3.  
   * *Transição Regulatória para RB51*: Caso uma fêmea ultrapasse 240 dias (8 meses) sem registro de vacinação B19, o sistema deve bloquear a seleção da vacina B19 e exigir a opção RB51, gerando um alerta sobre a necessidade de atestado assinado por veterinário habilitado e, quando exigido pela legislação estadual, a inclusão do laudo sorológico prévio negativo3.  
> 2. **Motor de Interdição Preventiva de Emissão de GTA**:  
   * O sistema deve calcular continuamente o *Status de Conformidade Sanitária* da propriedade.  
   * Se houver fêmeas acima de 8 meses sem o atestado sanitário de Brucelose homologado dentro da janela da etapa semestral corrente (até 10/Julho para o 1º semestre e até 10/Janeiro para o 2º semestre), a propriedade é sinalizada como pendente3.  
   * Em municípios com vacinação compulsória para Raiva, se houver animais sem registro de vacinação nos últimos 365 dias ou bezerras primovacinadas sem o registro de reforço dentro da janela de 21 a 30 dias, o status da propriedade fica pendente3.  
   * O EIXO deve emitir avisos de impedimento de emissão de GTA sempre que a propriedade apresentar pendências cadastrais perante o Serviço Veterinário Oficial3.  
> 3. **Rastreabilidade da Rede de Frio e Validade de Insumos**:  
   * No momento do lançamento da vacinação, o sistema deve verificar a data de validade do LoteVacina. Se a data de aplicação for posterior ao vencimento do lote, a operação deve ser rejeitada.  
   * O sistema deve registrar a instrução técnica de que vacinas vivas reconstituídas (B19 e RB51) devem ser consumidas no prazo máximo de 1 hora após a mistura com o diluente, garantindo a qualidade da imunização no campo13.  
> 4. **Automação do Planejamento Reprodutivo e Sanidade**:  
   * O Módulo de Sanidade deve comunicar-se com o Módulo de Reprodução do EIXO. Ao cadastrar a data prevista para o início da Estação de Monta, o motor de agendamento deve calcular a data de offset a ![][image2] dias e programar a aplicação do imunizante contra Doenças Reprodutivas (IBR, BVD e Leptospirose) para as matrizes, novilhas e touros integrantes dos lotes de reprodução20.

A implementação do módulo de sanidade do sistema EIXO sob estes parâmetros assegura o alinhamento com as normas do MAPA e das defesas estaduais, reduz riscos de autuações e interdições de propriedades, e fornece uma estrutura de governança sanitária automatizada para a pecuária nacional.

#### **Referências citadas**

> 1. Brasil Sem Vacinação Contra Febre Aftosa: novos desafios e, [https://revista.cfmv.gov.br/brasil-sem-vacinacao-contra-febre-aftosa-novos-desafios-e-oportunidades/](https://revista.cfmv.gov.br/brasil-sem-vacinacao-contra-febre-aftosa-novos-desafios-e-oportunidades/)  
> 2. Coordenação de Controle e Erradicação da Febre Aftosa e, [https://www.seagri.df.gov.br/febre-aftosa-2](https://www.seagri.df.gov.br/febre-aftosa-2)  
> 3. Calendário de Vacinação Bovina para 2026: Guia Completo, [https://softpec.com.br/blog/calendario-de-vacinacao-bovina-guia-completo-para-2025](https://softpec.com.br/blog/calendario-de-vacinacao-bovina-guia-completo-para-2025)  
> 4. PORTARIA MAPA Nº 665, DE 21 DE MARÇO DE...ARÇO DE 2024, [https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/saude-animal/programas-de-saude-animal/febre-aftosa/documentos-febre-aftosa/PortariaMAPA665.24.pdf](https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/saude-animal/programas-de-saude-animal/febre-aftosa/documentos-febre-aftosa/PortariaMAPA665.24.pdf)  
> 5. Portaria MAPA \- 678, de 30/04/2024 \- Defesa Agropecuária, [https://www.defesa.agricultura.sp.gov.br/legislacoes/portaria-mapa-678-de-30-04-2024,1867.html](https://www.defesa.agricultura.sp.gov.br/legislacoes/portaria-mapa-678-de-30-04-2024,1867.html)  
> 6. Mapa cria campanha nacional de vacinação contra brucelose, [https://feedfood.com.br/mapa-cria-campanha-nacional-de-vacinacao-contra-brucelose/](https://feedfood.com.br/mapa-cria-campanha-nacional-de-vacinacao-contra-brucelose/)  
> 7. Vacinação \- ADAB, [http://www.adab.ba.gov.br/servicos/sanidade-animal/vacinacao/](http://www.adab.ba.gov.br/servicos/sanidade-animal/vacinacao/)  
> 8. Vacinação contra brucelose em fêmeas bovinas e bubalinas segue, [https://aracatuba.sp.gov.br/noticias/vacinao-contra-brucelose-em-fmeas-bovinas-e-bubalinas-segue-at-30-de-junho](https://aracatuba.sp.gov.br/noticias/vacinao-contra-brucelose-em-fmeas-bovinas-e-bubalinas-segue-at-30-de-junho)  
> 9. PNCEBT \- Brucelose e Tuberculose \- IMA, [https://www.ima.mg.gov.br/defesa-animal/programas-sanitarios/brucelose-e-tuberculose](https://www.ima.mg.gov.br/defesa-animal/programas-sanitarios/brucelose-e-tuberculose)  
> 10. Portaria SEAGRI Nº 19 DE 21/03/2023 \- Estadual \- Distrito Federal, [https://www.legisweb.com.br/legislacao/?id=443462](https://www.legisweb.com.br/legislacao/?id=443462)  
> 11. Marcação segue obrigatória na vacinação contra brucelose no RS, [https://portaldbo.com.br/marcacao-dos-animais-segue-obrigatoria-na-vacinacao-contra-brucelose-no-rio-grande-do-sul/](https://portaldbo.com.br/marcacao-dos-animais-segue-obrigatoria-na-vacinacao-contra-brucelose-no-rio-grande-do-sul/)  
> 12. Normativa sobre Brucelose \- CRMV-GO, [https://crmvgo.org.br/normativa-sobre-brucelose/](https://crmvgo.org.br/normativa-sobre-brucelose/)  
> 13. para vacinação contra brucelose de bovídeos \- CRMV-SP, [https://crmvsp.gov.br/wp-content/uploads/2021/02/02.08.2024\_Guia\_pratico\_de\_procedimentos\_para\_vacinacao\_contra\_brucelose\_de\_bovideos.pdf](https://crmvsp.gov.br/wp-content/uploads/2021/02/02.08.2024_Guia_pratico_de_procedimentos_para_vacinacao_contra_brucelose_de_bovideos.pdf)  
> 14. Qual vacina contra brucelose devo utilizar: B-19 ou RB-51? \- IDARON, [https://www.idaron.ro.gov.br/index.php/2023/11/27/qual-vacina-contra-brucelose-devo-utilizar-b-19-ou-rb-51/](https://www.idaron.ro.gov.br/index.php/2023/11/27/qual-vacina-contra-brucelose-devo-utilizar-b-19-ou-rb-51/)  
> 15. Vacinação contra Brucelose \- Portal Gov.br, [https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/saude-animal/programas-de-saude-animal/pncebt/arquivos/vacinacao-contra-brucelose](https://www.gov.br/agricultura/pt-br/assuntos/sanidade-animal-e-vegetal/saude-animal/programas-de-saude-animal/pncebt/arquivos/vacinacao-contra-brucelose)  
> 16. PORTARIA SDA/MAPA Nº 1.633, DE 12 DE JUNHO DE 2026, [https://diariolink.com.br/resultado/10088572](https://diariolink.com.br/resultado/10088572)  
> 17. Portaria define regras para vacinação contra brucelose em bezerras, [https://agro2.com.br/pecuaria/portaria-define-regras-para-vacinacao-contra-brucelose-em-bezerras-e-bufalas/](https://agro2.com.br/pecuaria/portaria-define-regras-para-vacinacao-contra-brucelose-em-bezerras-e-bufalas/)  
> 18. Idaf orienta produtores sobre encerramento do prazo de declaração, [https://idaf.ac.gov.br/idaf-orienta-produtores-sobre-encerramento-do-prazo-de-declaracao-do-atestado-da-vacinacao-contra-brucelose/](https://idaf.ac.gov.br/idaf-orienta-produtores-sobre-encerramento-do-prazo-de-declaracao-do-atestado-da-vacinacao-contra-brucelose/)  
> 19. Idaf orienta produtores sobre prazo final para declaração da, [https://agazetadoacre.com/2026/01/noticias/geral/idaf-orienta-produtores-sobre-prazo-final-para-declaracao-da-vacinacao-contra-brucelose/](https://agazetadoacre.com/2026/01/noticias/geral/idaf-orienta-produtores-sobre-prazo-final-para-declaracao-da-vacinacao-contra-brucelose/)  
> 20. Qual é o calendário vacinal bovinos? \- Ourofino Saúde Animal, [https://www.ourofinosaudeanimal.com/perguntas-frequentes/bovinos/qual-e-o-calendario-vacinal-bovinos/](https://www.ourofinosaudeanimal.com/perguntas-frequentes/bovinos/qual-e-o-calendario-vacinal-bovinos/)  
> 21. Atuação do Mapa previne raiva em animais de produção \- Agrolink, [https://www.agrolink.com.br/noticias/atuacao-do-mapa-previne-raiva-em-animais-de-producao\_105745.html](https://www.agrolink.com.br/noticias/atuacao-do-mapa-previne-raiva-em-animais-de-producao_105745.html)  
> 22. Programa Nacional de Controle da Raiva dos Herbívoros e Outras, [https://www.adaf.am.gov.br/programa-nacional-de-controle-da-raiva-dos-herbivoros-e-outras-encefalopatias-pncrh/](https://www.adaf.am.gov.br/programa-nacional-de-controle-da-raiva-dos-herbivoros-e-outras-encefalopatias-pncrh/)  
> 23. Portaria ADEPARA Nº 7263 DE 25/11/2025 \- Estadual \- LegisWeb, [https://www.legisweb.com.br/legislacao/?id=486841](https://www.legisweb.com.br/legislacao/?id=486841)  
> 24. Programa Nacional de Controle da Raiva dos Herbívoros \- ADAB, [http://www.adab.ba.gov.br/servicos/sanidade-animal/programas-sanitarios/programa-estadual-de-controle-da-raiva-dos-herbivoros/](http://www.adab.ba.gov.br/servicos/sanidade-animal/programas-sanitarios/programa-estadual-de-controle-da-raiva-dos-herbivoros/)  
> 25. Calendário Sanitário Bovino 2026: Guia Completo \- NeoPecuária, [https://www.neopecuaria.com.br/blog/calendario-sanitario-do-gado-o-guia-completo-para-o-ano-todo](https://www.neopecuaria.com.br/blog/calendario-sanitario-do-gado-o-guia-completo-para-o-ano-todo)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAWCAYAAADTlvzyAAAAj0lEQVR4XmNgGAWjgEzgCsT/gTgLXYLWwJoBYnE3ugStgSoQ/wTiZegStAYiQPweiA+hS9AacADxfSC+BsTMaHI0A2JA/AGId6BLUBuoA/EvIF6ILkFtYMcASbFt6BLUBpEMdMqTuQwQi/zQJWgBGoDYCF1wFFACpIHYm0hsAdVDEQAVYeZEYk2onlGAFQAAsEMX0hlKsz0AAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD0AAAAaCAYAAAAEy1RnAAABzklEQVR4Xu2WPyhHURTHD2JQ8j8Z+BmEUTFILFahDBaLTRmQgZRBsZGBsii7DIpks9gkSWKXQUkGRSl/7rdz3q/zzu89/X7q9yfdT51+73zuve933p977yPyeDz/kSMX3xlELtki/s9PF2umTbNP3O/WRblpiwSdxyKcvcCOCJdN3l20qDyqplJxzZKXSN6Y7BFBDfGT1hQTD7wyHtxbkSXKiGt4Ve5A3KRyZy4eVA7WKfXmhDh2UWTcLPGgEeNRyIZx2QQ1nKv8RNyQcsi3VQ56xccyY4XjhaIHVblosDKH2Nc7eJWXlAMJ8aPG/4o9eSFwSFxTpXKd4uaUA/XiF4yPJbh7F7YhT/QQr+B3Li6Jp1jAAHGt08qBavE7xseCu4MBg7YhDWpddKcZ7TImE06Ja6uTvE1yrEEatMOvGB8LVsu/vtqYS8NpRr+MyYQuCk89LMA4Xkz2YJrEjxsfiz5pPpkirqPCeFsfjuNW71/36oBgbyyE+Rxc3LJyrcoH4EvtWuVgnjJ4cJj46DxhfD7AVvpo3A1xfQnl+sRpkG8aFwJ72Rvx3vwsgXn9QaknyzWrxDU8ye8X8Xy1BE92j7ju3XCzx+PxeDweTwHzAwZ8gjx20k/eAAAAAElFTkSuQmCC>