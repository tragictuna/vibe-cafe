// ==============================================================================
// 바이브 카페 주문서 & Supabase 연동 스크립트 (script.js)
// ==============================================================================

// ------------------------------------------------------------------------------
// 0. Supabase 설정 및 클라이언트 초기화
// ------------------------------------------------------------------------------
// 아래 두 상수에 Supabase 대시보드(Project Settings > API)의 Project URL과 anon 키를 넣어주세요.
const SUPABASE_URL = 'https://evdrdgtzuujurmyvynnv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZHJkZ3R6dXVqdXJteXZ5bm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTU2OTYsImV4cCI6MjEwNjk3MTY5Nn0.hyksEr6cu73EfVaA5NLyYkeuT1ETa9FdYdSo8BM4FAk';

// Supabase 클라이언트 생성 (CDN으로 로드된 window.supabase 객체 활용)
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ------------------------------------------------------------------------------
// 1. 필요한 HTML 요소 참조
// ------------------------------------------------------------------------------
// (1) 폼 및 주문 입력 요소
const orderForm = document.getElementById('order-form');               // 주문 폼
const customerNameInput = document.getElementById('customer-name');   // 이름 입력창
const customerPhoneInput = document.getElementById('customer-phone'); // 전화번호 입력창
const drinkSelect = document.getElementById('drink-select');           // 음료 선택 드롭다운
const quantityInput = document.getElementById('quantity');             // 수량 입력창
const requestsInput = document.getElementById('requests');             // 요청사항 텍스트창
const totalPriceSpan = document.getElementById('total-price');         // 예상 금액 표시 span
const confirmationArea = document.getElementById('confirmation-message'); // 주문 확인 메시지 창
const btnSubmit = document.getElementById('btn-submit');               // 주문하기 버튼
const btnReset = document.getElementById('btn-reset');                 // 다시 작성 버튼

// (2) 탭 메뉴 및 패널 요소
const tabOrderBtn = document.getElementById('tab-order');              // 주문하기 탭 버튼
const tabHistoryBtn = document.getElementById('tab-history');          // 주문 내역 탭 버튼
const panelOrder = document.getElementById('panel-order');             // 주문하기 패널
const panelHistory = document.getElementById('panel-history');         // 주문 내역 패널
const historyBadge = document.getElementById('history-badge');         // 주문 건수 배지

// (3) 주문 내역 목록 및 관리 요소
const ordersList = document.getElementById('orders-list');             // 주문 카드 목록 컨테이너
const ordersSummaryContainer = document.getElementById('orders-summary-container'); // 목록 하단 요약 컨테이너
const ordersSummaryText = document.getElementById('orders-summary-text'); // 총 주문 금액 및 건수 텍스트
const btnClearAll = document.getElementById('btn-clear-all');           // 내역 모두 지우기 버튼

// ------------------------------------------------------------------------------
// 2. 주문 데이터 상태 관리 (로컬 상태)
// ------------------------------------------------------------------------------
// 주문 객체들을 보관하는 배열 (최신 주문이 0번 인덱스에 오도록 관리)
const orders = [];
let nextOrderId = 1; // 로컬용 주문 번호

// ------------------------------------------------------------------------------
// 3. 예상 금액 계산 함수 (calculateTotal)
// ------------------------------------------------------------------------------
/**
 * - 음료 기본가, 사이즈 추가금, 추가 옵션 금액을 합산하고 수량을 곱해 최종 금액을 계산합니다.
 * - 음료를 아직 선택하지 않았다면 0원으로 표시합니다.
 * - 천 단위 콤마(toLocaleString)를 적용하여 화면에 표시하고 금액 숫자를 반환합니다.
 */
function calculateTotal() {
  const selectedDrinkOption = drinkSelect.options[drinkSelect.selectedIndex];
  const drinkPrice = parseInt(selectedDrinkOption.dataset.price || '0', 10);

  // 음료 미선택 시 0원 처리
  if (!drinkSelect.value || drinkPrice === 0) {
    totalPriceSpan.textContent = '0';
    return 0;
  }

  // 사이즈 추가금
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizePrice = selectedSizeRadio ? parseInt(selectedSizeRadio.dataset.price || '0', 10) : 0;

  // 옵션 추가금 합산
  let optionsPrice = 0;
  const checkedOptions = document.querySelectorAll('input[name="options"]:checked');
  checkedOptions.forEach(option => {
    optionsPrice += parseInt(option.dataset.price || '0', 10);
  });

  // 수량 (유효하지 않으면 1로 보정)
  let quantity = parseInt(quantityInput.value, 10);
  if (isNaN(quantity) || quantity < 1) {
    quantity = 1;
  }

  // 한 잔당 가격 및 총 금액 계산
  const pricePerCup = drinkPrice + sizePrice + optionsPrice;
  const total = pricePerCup * quantity;

  // 천 단위 콤마 표시
  totalPriceSpan.textContent = total.toLocaleString('ko-KR');
  return total;
}

// 입력값 변경 시 실시간 금액 재계산
orderForm.addEventListener('change', calculateTotal);
orderForm.addEventListener('input', calculateTotal);

// ------------------------------------------------------------------------------
// 4. 탭 전환 기능
// ------------------------------------------------------------------------------
/**
 * 활성화할 탭을 전환하는 함수
 * @param {'order' | 'history'} tabName 
 */
function switchTab(tabName) {
  if (tabName === 'order') {
    tabOrderBtn.classList.add('active');
    tabHistoryBtn.classList.remove('active');
    panelOrder.classList.remove('hidden');
    panelHistory.classList.add('hidden');
  } else {
    tabHistoryBtn.classList.add('active');
    tabOrderBtn.classList.remove('active');
    panelHistory.classList.remove('hidden');
    panelOrder.classList.add('hidden');
  }
}

tabOrderBtn.addEventListener('click', () => switchTab('order'));
tabHistoryBtn.addEventListener('click', () => switchTab('history'));

// ------------------------------------------------------------------------------
// 5. 주문 내역 화면 렌더링 함수 (renderOrders)
// ------------------------------------------------------------------------------
/**
 * orders 배열을 바탕으로 주문 내역 목록 화면을 그립니다.
 * XSS 공격 방지를 위해 사용자가 입력한 모든 텍스트는 textContent를 사용합니다.
 */
function renderOrders() {
  // 배지 숫자 업데이트
  historyBadge.textContent = orders.length;

  // 목록 컨테이너 비우기
  ordersList.textContent = '';

  // (1) 주문 내역이 하나도 없을 때
  if (orders.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-orders';
    emptyMsg.textContent = '아직 주문 내역이 없어요 ☕';
    ordersList.appendChild(emptyMsg);

    // 하단 요약 영역 숨기기
    ordersSummaryContainer.classList.add('hidden');
    return;
  }

  // (2) 주문 내역이 있을 때: 하단 요약 표시 및 계산
  ordersSummaryContainer.classList.remove('hidden');

  let totalRevenue = 0;

  // (3) 각 주문 카드를 DOM 요소로 생성하여 추가
  orders.forEach(order => {
    totalRevenue += order.totalPrice;

    // 카드 래퍼 생성
    const card = document.createElement('div');
    card.className = 'order-card';

    // 카드 헤더 (1줄: "#1 홍길동님 · 5,000원")
    const cardHeader = document.createElement('div');
    cardHeader.className = 'order-card-header';

    const cardTitle = document.createElement('span');
    cardTitle.className = 'order-card-title';
    cardTitle.textContent = `#${order.id} ${order.name}님 · ${order.totalPrice.toLocaleString('ko-KR')}원`;
    cardHeader.appendChild(cardTitle);

    // 취소 버튼 (오른쪽 상단)
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'order-card-cancel';
    btnCancel.textContent = '취소';
    btnCancel.addEventListener('click', () => {
      cancelOrder(order.id);
    });
    card.appendChild(btnCancel);
    card.appendChild(cardHeader);

    // 2줄: 음료, 사이즈, 옵션, 수량 (예: "카페라떼 M사이즈 (샷 추가) 1잔")
    const cardDrink = document.createElement('div');
    cardDrink.className = 'order-card-drink';
    const optionText = order.options && order.options.length > 0 ? ` (${order.options.join(', ')})` : '';
    cardDrink.textContent = `${order.drink} ${order.size}사이즈${optionText} ${order.quantity}잔`;
    card.appendChild(cardDrink);

    // 3줄: 요청사항(있을 때만) · 주문 시간
    const cardMeta = document.createElement('div');
    cardMeta.className = 'order-card-meta';
    if (order.requests) {
      cardMeta.textContent = `요청: ${order.requests} · ${order.time}`;
    } else {
      cardMeta.textContent = order.time;
    }
    card.appendChild(cardMeta);

    ordersList.appendChild(card);
  });

  // 하단 총 주문 금액 요약 업데이트
  ordersSummaryText.textContent = `총 주문 금액: ${totalRevenue.toLocaleString('ko-KR')}원 (${orders.length}건)`;
}

// ------------------------------------------------------------------------------
// 6. 개별 주문 취소 및 전체 내역 삭제
// ------------------------------------------------------------------------------
/**
 * 개별 주문 취소 처리 함수
 * @param {number} orderId 
 */
function cancelOrder(orderId) {
  const confirmed = confirm('이 주문을 취소하시겠습니까?');
  if (confirmed) {
    const targetIndex = orders.findIndex(item => item.id === orderId);
    if (targetIndex !== -1) {
      orders.splice(targetIndex, 1);
      renderOrders();
    }
  }
}

/**
 * 전체 내역 모두 지우기
 */
btnClearAll.addEventListener('click', () => {
  if (orders.length === 0) return;
  const confirmed = confirm('주문 내역을 모두 지우시겠습니까?');
  if (confirmed) {
    orders.length = 0; // 배열 비우기
    renderOrders();
  }
});

// ------------------------------------------------------------------------------
// 7. 주문하기 폼 제출 (submit) 및 Supabase 저장 처리
// ------------------------------------------------------------------------------
orderForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const customerName = customerNameInput.value.trim();
  const phone = customerPhoneInput ? customerPhoneInput.value.trim() : '';
  const selectedDrinkValue = drinkSelect.value;

  // (1) 필수 입력값 유효성 검사
  if (!customerName) {
    alert('이름을 입력해주세요');
    customerNameInput.focus();
    return;
  }

  if (!selectedDrinkValue) {
    alert('음료를 선택해주세요');
    drinkSelect.focus();
    return;
  }

  // (2) 주문 항목 데이터 수집
  const selectedOption = drinkSelect.options[drinkSelect.selectedIndex];
  const drinkPrice = parseInt(selectedOption.dataset.price || '0', 10);
  const drinkName = selectedOption.text.split(' ')[0]; // "카페라떼 4,000원" -> "카페라떼"

  // 사이즈
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizeValue = selectedSizeRadio ? selectedSizeRadio.value : 'M';

  // 옵션 (배열 형태로 수집)
  const optionsArray = [];
  const checkedOptions = document.querySelectorAll('input[name="options"]:checked');
  checkedOptions.forEach(option => {
    const label = document.querySelector(`label[for="${option.id}"]`);
    if (label) {
      const cleanOptionName = label.textContent.split('(')[0].trim();
      optionsArray.push(cleanOptionName);
    }
  });

  // 수량 및 요청사항
  const quantity = parseInt(quantityInput.value, 10) || 1;
  const request = requestsInput ? requestsInput.value.trim() : '';

  // 총 예상 금액
  const totalPrice = calculateTotal();

  // (3) 중복 클릭 방지: 주문하기 버튼 비활성화 및 로딩 표시
  btnSubmit.disabled = true;
  const originalBtnText = btnSubmit.textContent;
  btnSubmit.textContent = '주문 처리 중...';

  try {
    // (4) Supabase DB에 저장할 데이터 객체 구성 (원래 열 이름으로 매핑)
    const orderData = {
      customer_name: customerName,
      customer_phone: phone,
      drink: drinkName,
      size: sizeValue,
      options: optionsArray.join(', '), // 원래 스키마 text 타입에 맞추어 문자열 변환
      quantity: quantity,
      requests: request,
      total_price: totalPrice
    };

    // Supabase 클라이언트가 초기화되어 있는 경우 DB에 INSERT 실행
    if (supabaseClient && SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
      const { data, error } = await supabaseClient
        .from('orders')
        .insert([orderData])
        .select();

      if (error) {
        throw error;
      }
    }

    // (5) 저장 성공 시: 주문 시간 생성 및 로컬 주문 내역 업데이트
    const now = new Date();
    const timeString = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    const newOrder = {
      id: nextOrderId++,
      name: customerName,
      drink: drinkName,
      size: sizeValue,
      options: optionsArray,
      quantity: quantity,
      requests: request,
      totalPrice: totalPrice,
      time: timeString
    };

    orders.unshift(newOrder); // 최신 주문 추가
    renderOrders();           // 주문 내역 갱신

    // (6) 기존 주문 확인 메시지 표시
    const optionsDisplay = optionsArray.length > 0 ? ` (${optionsArray.join(', ')})` : '';
    const message = `${customerName}님, ${drinkName} ${sizeValue}사이즈${optionsDisplay} ${quantity}잔, 총 ${totalPrice.toLocaleString('ko-KR')}원 주문이 접수되었습니다!`;

    confirmationArea.textContent = message;
    confirmationArea.classList.remove('hidden');

  } catch (error) {
    // 저장 실패 시 에러 처리
    console.error('Supabase 주문 저장 에러:', error);
    alert('주문 저장에 실패했어요');
  } finally {
    // (7) 작업 완료 후 주문하기 버튼 다시 활성화
    btnSubmit.disabled = false;
    btnSubmit.textContent = originalBtnText;
  }
});

// ------------------------------------------------------------------------------
// 8. 다시 작성 (리셋) 버튼 이벤트 처리
// ------------------------------------------------------------------------------
btnReset.addEventListener('click', function () {
  setTimeout(() => {
    // 사이즈 M 기본 체크
    const sizeM = document.getElementById('size-m');
    if (sizeM) sizeM.checked = true;

    // 수량 1 초기화
    quantityInput.value = '1';

    // 금액 0원으로 재계산 및 갱신
    calculateTotal();

    // 주문 확인 메시지 창 숨기기
    confirmationArea.textContent = '';
    confirmationArea.classList.add('hidden');
  }, 0);
});

// ------------------------------------------------------------------------------
// 9. 페이지 초기 실행
// ------------------------------------------------------------------------------
calculateTotal();
renderOrders();
