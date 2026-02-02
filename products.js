// ==========================================
// 品名マスター データベース
// products.js
// ==========================================

// 商品カテゴリの定義
const productCategories = {
  'pvc-pipe': { name: '塩ビ管', parent: 'plumbing', icon: '🔧' },
  'pvc-joint': { name: '塩ビ継手', parent: 'plumbing', icon: '🔧' },
  'poly-pipe': { name: '架橋ポリ管', parent: 'plumbing', icon: '🔧' },
  'poly-joint': { name: '架橋ポリ継手', parent: 'plumbing', icon: '🔧' },
  'aircon': { name: 'エアコン配管', parent: 'aircon', icon: '❄️' },
  'electric': { name: '電気部材', parent: 'electric', icon: '⚡' },
  'support': { name: '支持金具', parent: 'support', icon: '🔩' },
  'insulation': { name: '保温材', parent: 'insulation', icon: '🧴' },
  'consumable': { name: '消耗品', parent: 'consumable', icon: '🧹' },
  'faucet': { name: '水栓金具', parent: 'plumbing', icon: '🚰' },
};

// デフォルト商品データを生成
function getDefaultProductMaster() {
  let id = 1;
  const products = [];
  
  // ==========================================
  // 塩ビ管（VP管）
  // ==========================================
  const vpSizes = [13, 16, 20, 25, 30, 40, 50, 65, 75, 100];
  vpSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `VP管 ${size}mm`,
      category: 'pvc-pipe',
      subCategory: 'VP管',
      size: `${size}mm`,
      aliases: [`VP${size}`, `塩ビ管${size}`, `塩ビパイプ${size}`, `VP${size}mm`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ管（VU管）
  // ==========================================
  const vuSizes = [40, 50, 65, 75, 100, 125, 150];
  vuSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `VU管 ${size}mm`,
      category: 'pvc-pipe',
      subCategory: 'VU管',
      size: `${size}mm`,
      aliases: [`VU${size}`, `VU管${size}`, `VU${size}mm`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ管（HI管）
  // ==========================================
  const hiSizes = [13, 16, 20, 25];
  hiSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `HI管 ${size}mm`,
      category: 'pvc-pipe',
      subCategory: 'HI管',
      size: `${size}mm`,
      aliases: [`HI${size}`, `HI管${size}`, `耐衝撃${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（エルボ）
  // ==========================================
  const jointSizes = [13, 16, 20, 25, 30, 40, 50, 65, 75, 100];
  jointSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `エルボ ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'エルボ',
      size: `${size}mm`,
      aliases: [`エルボ${size}`, `L${size}`, `90°エルボ${size}`],
      defaultPrice: 0
    });
  });
  
  // 45°エルボ
  jointSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `45°エルボ ${size}mm`,
      category: 'pvc-joint',
      subCategory: '45°エルボ',
      size: `${size}mm`,
      aliases: [`45エルボ${size}`, `45°L${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（チーズ）
  // ==========================================
  jointSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `チーズ ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'チーズ',
      size: `${size}mm`,
      aliases: [`チーズ${size}`, `T${size}`, `Tチーズ${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（ソケット）
  // ==========================================
  jointSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `ソケット ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'ソケット',
      size: `${size}mm`,
      aliases: [`ソケット${size}`, `S${size}`, `TSソケット${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（ユニオン）
  // ==========================================
  const unionSizes = [13, 16, 20, 25, 30, 40, 50];
  unionSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `ユニオン ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'ユニオン',
      size: `${size}mm`,
      aliases: [`ユニオン${size}`, `U${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（バルブソケット）
  // ==========================================
  const vsSizes = [13, 16, 20, 25, 30, 40, 50];
  vsSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `バルブソケット ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'バルブソケット',
      size: `${size}mm`,
      aliases: [`VS${size}`, `バルソケ${size}`, `ねじソケット${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（キャップ）
  // ==========================================
  jointSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `キャップ ${size}mm`,
      category: 'pvc-joint',
      subCategory: 'キャップ',
      size: `${size}mm`,
      aliases: [`キャップ${size}`, `C${size}`, `TSキャップ${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 塩ビ継手（異径ソケット）
  // ==========================================
  const reducerPairs = [[25,20], [25,13], [30,25], [40,25], [40,30], [50,40], [50,25], [65,50], [75,65], [100,75]];
  reducerPairs.forEach(([big, small]) => {
    products.push({
      id: id++,
      officialName: `異径ソケット ${big}×${small}mm`,
      category: 'pvc-joint',
      subCategory: '異径ソケット',
      size: `${big}×${small}mm`,
      aliases: [`異径${big}×${small}`, `RS${big}×${small}`, `レデューサ${big}×${small}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 架橋ポリエチレン管
  // ==========================================
  const polySizes = ['10A', '13A', '16A', '20A'];
  polySizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `架橋ポリエチレン管 ${size}`,
      category: 'poly-pipe',
      subCategory: '架橋ポリ管',
      size: size,
      aliases: [`架橋ポリ${size}`, `PEX${size}`, `ポリ管${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // ポリブデン管
  // ==========================================
  polySizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `ポリブデン管 ${size}`,
      category: 'poly-pipe',
      subCategory: 'ポリブデン管',
      size: size,
      aliases: [`ポリブデン${size}`, `PB管${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 架橋ポリ継手
  // ==========================================
  const polyJointTypes = ['エルボ', 'チーズ', 'ソケット', 'アダプター（おす）', 'アダプター（めす）'];
  polySizes.forEach(size => {
    polyJointTypes.forEach(type => {
      products.push({
        id: id++,
        officialName: `架橋ポリ ${type} ${size}`,
        category: 'poly-joint',
        subCategory: type,
        size: size,
        aliases: [`ポリ${type}${size}`, `架橋${type}${size}`],
        defaultPrice: 0
      });
    });
  });
  
  // ==========================================
  // エアコン配管（ペアコイル）
  // ==========================================
  const paircoilSizes = ['2分3分', '2分4分', '3分5分'];
  paircoilSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `ペアコイル ${size}`,
      category: 'aircon',
      subCategory: 'ペアコイル',
      size: size,
      aliases: [`ペアコイル${size}`, `ペア管${size}`, `冷媒管${size}`],
      defaultPrice: 0
    });
  });
  
  // 単品銅管
  const copperSizes = ['2分', '3分', '4分', '5分'];
  copperSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `銅管 ${size}`,
      category: 'aircon',
      subCategory: '銅管',
      size: size,
      aliases: [`銅管${size}`, `冷媒管${size}`],
      defaultPrice: 0
    });
  });
  
  // ドレンホース
  products.push({
    id: id++,
    officialName: 'ドレンホース 14mm',
    category: 'aircon',
    subCategory: 'ドレンホース',
    size: '14mm',
    aliases: ['ドレンホース', 'ドレン管', 'エアコンドレン'],
    defaultPrice: 0
  });
  products.push({
    id: id++,
    officialName: 'ドレンホース 16mm',
    category: 'aircon',
    subCategory: 'ドレンホース',
    size: '16mm',
    aliases: ['ドレンホース16', 'ドレン管16'],
    defaultPrice: 0
  });
  
  // ==========================================
  // 電気部材（Fケーブル）
  // ==========================================
  const cableSizes = [
    { thick: '1.6mm', cores: '2芯' },
    { thick: '1.6mm', cores: '3芯' },
    { thick: '2.0mm', cores: '2芯' },
    { thick: '2.0mm', cores: '3芯' },
    { thick: '2.6mm', cores: '2芯' },
  ];
  cableSizes.forEach(({thick, cores}) => {
    products.push({
      id: id++,
      officialName: `VVFケーブル ${thick} ${cores}`,
      category: 'electric',
      subCategory: 'VVFケーブル',
      size: `${thick} ${cores}`,
      aliases: [`VVF${thick}${cores}`, `Fケーブル${thick}${cores}`, `${thick}${cores}`],
      defaultPrice: 0
    });
  });
  
  // TVアンテナケーブル
  products.push({
    id: id++,
    officialName: '同軸ケーブル 5C-FB',
    category: 'electric',
    subCategory: '同軸ケーブル',
    size: '5C-FB',
    aliases: ['5C-FB', '同軸5C', 'アンテナケーブル', 'TVケーブル'],
    defaultPrice: 0
  });
  products.push({
    id: id++,
    officialName: '同軸ケーブル 4C-FB',
    category: 'electric',
    subCategory: '同軸ケーブル',
    size: '4C-FB',
    aliases: ['4C-FB', '同軸4C'],
    defaultPrice: 0
  });
  
  // ==========================================
  // 支持金具
  // ==========================================
  // T足
  const tashiSizes = [13, 20, 25, 30, 40, 50];
  tashiSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `T足 ${size}mm`,
      category: 'support',
      subCategory: 'T足',
      size: `${size}mm`,
      aliases: [`T足${size}`, `Tあし${size}`, `立バンド${size}`],
      defaultPrice: 0
    });
  });
  
  // サドルバンド
  const saddleSizes = [13, 16, 20, 25, 30, 40, 50, 65, 75, 100];
  saddleSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `サドルバンド ${size}mm`,
      category: 'support',
      subCategory: 'サドルバンド',
      size: `${size}mm`,
      aliases: [`サドル${size}`, `サドルバンド${size}`, `樹脂サドル${size}`],
      defaultPrice: 0
    });
  });
  
  // 吊りバンド
  const tsuriBandSizes = [25, 30, 40, 50, 65, 75, 100];
  tsuriBandSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `吊りバンド ${size}mm`,
      category: 'support',
      subCategory: '吊りバンド',
      size: `${size}mm`,
      aliases: [`吊バンド${size}`, `吊り${size}`],
      defaultPrice: 0
    });
  });
  
  // ==========================================
  // 保温材
  // ==========================================
  const insulationSizes = [10, 13, 16, 20, 25, 30, 40, 50];
  insulationSizes.forEach(size => {
    products.push({
      id: id++,
      officialName: `保温チューブ ${size}mm`,
      category: 'insulation',
      subCategory: '保温チューブ',
      size: `${size}mm`,
      aliases: [`保温材${size}`, `ライトカバー${size}`, `保温${size}`],
      defaultPrice: 0
    });
  });
  
  // キャンバステープ
  products.push({
    id: id++,
    officialName: 'キャンバステープ 50mm',
    category: 'insulation',
    subCategory: 'キャンバステープ',
    size: '50mm',
    aliases: ['キャンバス', 'キャンバステープ', '非粘着テープ'],
    defaultPrice: 0
  });
  
  // ==========================================
  // 消耗品
  // ==========================================
  // コーキング
  const caulkColors = ['ホワイト', 'グレー', 'クリア', 'ブラック', 'アイボリー'];
  caulkColors.forEach(color => {
    products.push({
      id: id++,
      officialName: `コーキング ${color}`,
      category: 'consumable',
      subCategory: 'コーキング',
      size: color,
      aliases: [`コーキング${color}`, `シリコン${color}`, `シーラント${color}`],
      defaultPrice: 0
    });
  });
  
  // 変成シリコン
  products.push({
    id: id++,
    officialName: '変成シリコン',
    category: 'consumable',
    subCategory: 'コーキング',
    size: '',
    aliases: ['変成シリコン', '変成コーキング', 'ペインタブル'],
    defaultPrice: 0
  });
  
  // マスキングテープ
  const maskingWidths = [12, 15, 18, 24, 30];
  maskingWidths.forEach(width => {
    products.push({
      id: id++,
      officialName: `マスキングテープ ${width}mm`,
      category: 'consumable',
      subCategory: 'マスキングテープ',
      size: `${width}mm`,
      aliases: [`マスキング${width}`, `マステ${width}`, `養生テープ${width}`],
      defaultPrice: 0
    });
  });
  
  // シールテープ
  products.push({
    id: id++,
    officialName: 'シールテープ',
    category: 'consumable',
    subCategory: 'シールテープ',
    size: '',
    aliases: ['シールテープ', 'Pテープ', 'ねじシール'],
    defaultPrice: 0
  });
  
  // 塩ビ接着剤
  products.push({
    id: id++,
    officialName: '塩ビ接着剤',
    category: 'consumable',
    subCategory: '接着剤',
    size: '',
    aliases: ['塩ビのり', '塩ビ接着', 'エスロン接着剤'],
    defaultPrice: 0
  });
  
  // HI接着剤
  products.push({
    id: id++,
    officialName: 'HI接着剤',
    category: 'consumable',
    subCategory: '接着剤',
    size: '',
    aliases: ['HI接着', 'HI用接着剤', '耐衝撃接着剤'],
    defaultPrice: 0
  });
  
  return products;
}

// ファイル読み込み確認用
console.log('products.js loaded - ' + getDefaultProductMaster().length + ' products available');
