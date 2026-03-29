# ZELIA API Documentation

## Base URLs

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:8000/api/` |
| Production  | `https://zeliaoms.mcdave.co.ke/api/` |

## Authentication

All endpoints except login require a token in every request header:

```
Authorization: Token <your_token_here>
```

---

## Pagination

All list endpoints return paginated results:

```
GET /api/orders/?page=2&page_size=50
```

| Parameter   | Default | Description        |
|-------------|---------|--------------------|
| `page`      | 1       | Page number        |
| `page_size` | 20      | Items per page     |

**Response envelope:**
```json
{
    "count": 150,
    "next": "http://localhost:8000/api/orders/?page=3",
    "previous": "http://localhost:8000/api/orders/?page=1",
    "results": []
}
```

---

## Error Format

```json
{
    "status": "error",
    "code": 400,
    "message": "An error occurred",
    "details": {
        "field_name": ["Error message"]
    }
}
```

| Code | Meaning       |
|------|---------------|
| 200  | Success       |
| 201  | Created       |
| 400  | Bad Request   |
| 401  | Unauthorized  |
| 403  | Forbidden     |
| 404  | Not Found     |
| 500  | Server Error  |

---

## 1. Authentication

### Login
`POST /api/auth/login/`

**Request:**
```json
{
    "username": "your_username",
    "password": "your_password"
}
```

**Response `200`:**
```json
{
    "token": "abc123def456xyz789",
    "user": {
        "id": 1,
        "user": {
            "id": 1,
            "username": "john_doe",
            "email": "john@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "is_staff": false,
            "is_superuser": false
        },
        "date_modified": "2026-03-10T15:30:00Z",
        "phone": "0741484426",
        "department": "Sales",
        "national_id": "12345678",
        "join_date": "2025-01-15",
        "gender": "M",
        "is_admin": false,
        "is_salesperson": true
    },
    "message": "Login successful"
}
```

### Logout
`POST /api/auth/logout/`

**Response `200`:**
```json
{ "message": "Logout successful" }
```

### Register User *(Admin only)*
`POST /api/auth/register/`

**Request:**
```json
{
    "username": "john",
    "email": "john@example.com",
    "password": "securepass",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "0712345678",
    "role": "salesperson",
    "store": "mcdave"
}
```

### Password Reset Flow
| Step | Method | Endpoint | Body |
|------|--------|----------|------|
| 1. Request token | `POST` | `/api/auth/password-reset/request_reset/` | `{ "email": "john@example.com" }` |
| 2. Validate token | `POST` | `/api/auth/password-reset/validate_token/` | `{ "token": "uuid-token-here" }` |
| 3. Confirm reset  | `POST` | `/api/auth/password-reset/confirm_reset/`  | `{ "token": "uuid-token", "new_password": "newpass" }` |

---

## 2. User Profile

### Get My Profile
`GET /api/users/profile/me/`

**Response:**
```json
{
    "id": 1,
    "user": {
        "id": 1,
        "username": "john_doe",
        "email": "john@example.com",
        "first_name": "John",
        "last_name": "Doe"
    },
    "phone": "0741484426",
    "department": "Sales",
    "national_id": "12345678",
    "join_date": "2025-01-15",
    "gender": "M",
    "is_admin": false,
    "is_salesperson": true,
    "date_modified": "2026-03-10T15:30:00Z"
}
```

### Update Profile
`PUT /api/users/profile/update_profile/`

**Request:**
```json
{
    "phone": "0700123456",
    "gender": "F"
}
```

---

## 3. Products

### List Products
`GET /api/products/`

| Query Param | Values / Notes |
|-------------|----------------|
| `page`      | Page number |
| `category`  | Category ID |
| `status`    | `available`, `limited`, `offer`, `not_available` |
| `search`    | Name, description, or barcode |
| `ordering`  | `name`, `created_at`, `retail_price` |

**Response item:**
```json
{
    "id": 1,
    "name": "Product A",
    "description": "High quality product",
    "category": 1,
    "category_name": "Electronics",
    "image": "https://zeliaoms.mcdave.co.ke/media/uploads/products/image.jpg",
    "status": "available",
    "retail_price": "5000.00",
    "mcdave_stock": 50,
    "kisii_stock": 30,
    "offshore_stock": 20,
    "total_stock": 100,
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2026-03-10T15:30:00Z"
}
```

### Get Product Detail
`GET /api/products/{id}/`

### Get Price by Customer Category
`GET /api/products/{id}/price_by_category/?category=wholesale`

| `category` values |
|-------------------|
| `wholesale` `factory` `distributor` `offshore` `retail` |

**Response:**
```json
{
    "product_id": 1,
    "product_name": "Product A",
    "customer_category": "wholesale",
    "price": 4500.00,
    "stock": {
        "mcdave": 50,
        "kisii": 30,
        "offshore": 20,
        "total": 100
    }
}
```

### Low Stock Products
`GET /api/products/low_stock/?threshold=10`

### Products by Category
`GET /api/products/by_category/?category_id=1`

---

## 4. Categories

### List Categories
`GET /api/categories/`

**Response item:**
```json
{
    "id": 1,
    "name": "Electronics",
    "description": "Electronic devices and components",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2026-03-10T15:30:00Z"
}
```

---

## 5. Customers

### List Customers
`GET /api/customers/`

| Query Param        | Notes |
|--------------------|-------|
| `page`             | Page number |
| `default_category` | Customer category |
| `sales_person`     | Sales person ID |
| `search`           | Name, phone, or email |
| `ordering`         | `first_name`, `created_at` |

**Response item:**
```json
{
    "id": 1,
    "first_name": "Jane",
    "last_name": "Smith",
    "phone_number": "+254741484426",
    "formatted_phone": "0741484426",
    "email": "jane@example.com",
    "sales_person": 1,
    "sales_person_name": "John Doe",
    "address": "Nairobi, Kenya",
    "default_category": "wholesale",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2026-03-10T15:30:00Z"
}
```

### Create Customer
`POST /api/customers/`

**Request:**
```json
{
    "first_name": "Alice",
    "last_name": "Johnson",
    "phone_number": "0700123456",
    "email": "alice@example.com",
    "address": "Mombasa",
    "default_category": "retail"
}
```

### Customer Orders
`GET /api/customers/{id}/orders/`

### Customer Quotes
`GET /api/customers/{id}/quotes/`

### Customers by Category
`GET /api/customers/by_category/?category=wholesale`

---

## 6. Orders

### List Orders
`GET /api/orders/`

| Query Param       | Values |
|-------------------|--------|
| `customer`        | Customer ID |
| `delivery_status` | `pending`, `completed`, `returned`, `cancelled` |
| `paid_status`     | `pending`, `completed`, `partially_paid`, `cancelled` |
| `store`           | `mcdave`, `kisii`, `offshore` |

### Get Order Detail
`GET /api/orders/{id}/`

### Create Order
`POST /api/orders/create_order/`

**Request:**
```json
{
    "customer_id": 1,
    "customer_category": "wholesale",
    "vat_variation": "with_vat",
    "address": "Delivery Address",
    "phone": "0741484426",
    "store": "mcdave",
    "delivery_fee": 500.00,
    "items": [
        {
            "product_id": 1,
            "quantity": 10,
            "unit_price": 4500.00,
            "variance": 0.00
        },
        {
            "product_id": 2,
            "quantity": 5,
            "unit_price": 2000.00,
            "variance": 100.00
        }
    ]
}
```

**Response `201`:**
```json
{
    "id": 1,
    "customer": 1,
    "customer_name": "Jane Smith",
    "sales_person": 1,
    "sales_person_name": "John Doe",
    "customer_category": "wholesale",
    "vat_variation": "with_vat",
    "address": "Nairobi",
    "phone": "0741484426",
    "order_date": "2026-03-10T15:30:00Z",
    "delivery_status": "pending",
    "paid_status": "pending",
    "store": "mcdave",
    "total_amount": "47500.00",
    "amount_paid": "0.00",
    "balance": 47500.00,
    "delivery_fee": "500.00",
    "latitude": null,
    "longitude": null,
    "location_address": null,
    "quote": null,
    "order_items": [
        {
            "id": 1,
            "product": 1,
            "product_name": "Product A",
            "quantity": 10,
            "unit_price": "4500.00",
            "variance": "0.00",
            "line_total": "45000.00"
        }
    ],
    "created_at": "2026-03-10T15:30:00Z",
    "updated_at": "2026-03-10T15:30:00Z"
}
```

### Update Order Status
`PUT /api/orders/{id}/update_status/`

**Request:**
```json
{
    "delivery_status": "completed",
    "paid_status": "partially_paid"
}
```

### Get Order Items
`GET /api/orders/{id}/items/`

### Dashboard Statistics
`GET /api/orders/dashboard_stats/`

**Response:**
```json
{
    "total_orders": 45,
    "total_revenue": 250000.00,
    "pending_orders": 12,
    "completed_orders": 33,
    "total_customers": 25,
    "total_products": 150
}
```

---

## 7. Quotes

### List Quotes
`GET /api/quotes/`

| Query Param | Values |
|-------------|--------|
| `customer`  | Customer ID |
| `status`    | `draft`, `sent`, `approved`, `rejected`, `converted` |

### Get Quote Detail
`GET /api/quotes/{id}/`

### Create Quote
`POST /api/quotes/create_quote/`

**Request:**
```json
{
    "customer_id": 1,
    "customer_category": "wholesale",
    "vat_variation": "with_vat",
    "notes": "Special pricing for bulk order",
    "items": [
        {
            "product_id": 1,
            "quantity": 20,
            "unit_price": 4200.00,
            "variance": 0.00
        }
    ]
}
```

### Update Quote Status
`PUT /api/quotes/{id}/update_status/`

**Request:**
```json
{ "status": "approved" }
```

### Convert Quote to Order
`POST /api/quotes/{id}/convert_to_order/`

---

## 8. Payments

### Add Payment
`POST /api/payments/add_payment/`

**Request:**
```json
{
    "order_id": 1,
    "amount": 25000.00,
    "payment_method": "cash",
    "transaction_id": "TXN123456"
}
```

**Response:**
```json
{
    "id": 1,
    "order": 1,
    "order_id": 1,
    "amount": "25000.00",
    "payment_method": "cash",
    "transaction_id": "TXN123456",
    "status": "completed",
    "created_at": "2026-03-10T15:30:00Z"
}
```

### Payments by Order
`GET /api/payments/by_order/?order_id=1`

---

## 9. Stock Management

### Stock Movements
`GET /api/stock/movements/`

| Query Param  | Notes |
|--------------|-------|
| `product_id` | Filter by product |
| `store`      | `mcdave`, `kisii`, `offshore` |

### Stock Transfers
`GET /api/stock/transfers/`

### Initiate Transfer
`POST /api/stock/transfers/initiate_transfer/`

**Request:**
```json
{
    "from_store": "mcdave",
    "to_store": "kisii",
    "items": [{ "product_id": 5, "quantity": 10 }],
    "notes": "Transfer to secondary location"
}
```

### Confirm Transfer Receipt
`POST /api/stock/transfers/{id}/confirm_receipt/`

### Adjust Stock
`POST /api/stock/adjustments/adjust_stock/`

### Stock Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/stock/alerts/` | View all alerts |
| `POST` | `/api/stock/alerts/{id}/mark_resolved/` | Resolve an alert |

---

## 10. Purchase Orders

### Create Purchase Order
`POST /api/purchase-orders/create_purchase_order/`

### Receive Goods
`POST /api/purchase-orders/{id}/receive_goods/`

### List Pending Purchase Orders
`GET /api/purchase-orders/pending/`

---

## 11. Messaging & Notifications

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/messages/` | List user's messages |
| `POST` | `/api/messages/send_message/` | Send a new message |
| `GET`  | `/api/messages/unread/` | Unread messages |
| `POST` | `/api/messages/{id}/mark_read/` | Mark message as read |
| `GET`  | `/api/messages/conversation/?user_id=3` | Chat history with a user |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/notifications/unread/` | Unread notifications |
| `POST` | `/api/notifications/{id}/mark_read/` | Mark one as read |
| `POST` | `/api/notifications/mark_all_read/` | Mark all as read |

---

## 12. Beat / Territory Management

### Beat Plans
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/beat-plans/` | List all plans |
| `POST` | `/api/beat-plans/create_plan/` | Create a plan |
| `GET`  | `/api/beat-plans/{id}/visits/` | Plan's visits |
| `PUT`  | `/api/beat-plans/{id}/update_status/` | Update plan status |

### Beat Visits
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/beat-visits/` | List visits |
| `POST` | `/api/beat-visits/log_visit/` | Log a visit |
| `GET`  | `/api/beat-visits/today/` | Today's visits |
| `GET`  | `/api/beat-visits/by_date/?date=2026-03-10` | Visits by date |

---

## 13. M-Pesa

### STK Push
`POST /api/mpesa-transactions/stk_push/`

### Payment Callback
`POST /api/mpesa-transactions/callback/`

### Query by Phone
`GET /api/mpesa-transactions/by_phone/?phone=0712345678`

---

## 14. Customer Feedback

### Submit Feedback
`POST /api/feedback/submit_feedback/`

### Filter Feedback
| Endpoint | Description |
|----------|-------------|
| `/api/feedback/by_rating/` | Filter by rating |
| `/api/feedback/by_type/` | Filter by type |

---

## 15. Activity Logs

`GET /api/activity-logs/`

| Query Param | Notes |
|-------------|-------|
| `user`      | Filter by user ID |
| `action`    | Filter by action type |
| `ordering`  | Order by timestamp |

---

## 16. ChatBot Knowledge Base

`GET /api/chatbot-knowledge/`

| Query Param | Notes |
|-------------|-------|
| `search`    | Search questions and answers |
| `category`  | Filter by category |

---

*Last Updated: March 28, 2026*
